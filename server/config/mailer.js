// Sends email via Brevo's HTTP API instead of raw SMTP — Render's free
// tier blocks outbound SMTP ports, but HTTPS API calls go through fine.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Every one of the ~20 sendEmail() call sites across the codebase builds
// only a bare fragment (<p>/<ul>/etc., no <!DOCTYPE>/<html>/<head>/<body>)
// — a round-12 email audit flagged this as a real, if low-per-email-
// visibility, deliverability/rendering risk: Gmail tolerates a bare
// fragment fine, but stricter/legacy clients (Outlook desktop's Word
// rendering engine in particular) are documented to behave inconsistently
// without a real document structure and a meta charset. Wrapping once
// here, at the single choke point every email already passes through,
// fixes all ~20 call sites at once rather than needing each one updated
// individually — none of them need to change what they pass in.
const wrapEmailHtml = (bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mittal Collections</title>
</head>
<body style="margin:0;padding:0;">
${bodyHtml}
</body>
</html>`;

// "a@x.com, b@y.com" (or ";"-separated, or an array of either) -> a
// de-duplicated list of trimmed addresses. Lets ADMIN_NOTIFICATION_EMAIL
// hold several admins, so every admin alert (new order, signup, payment
// review, review copy...) reaches all of them without each call site
// changing. A single customer address passes through unchanged.
export const parseEmailList = (value) => {
  const items = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const list = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    for (const part of item.split(/[,;]/)) {
      const email = part.trim();
      const key = email.toLowerCase();
      if (!email || seen.has(key)) continue;
      seen.add(key);
      list.push(email);
    }
  }
  return list;
};

export const sendEmail = async ({ to, subject, html, bcc }) => {
  const toList = parseEmailList(to);
  if (toList.length === 0) throw new Error("sendEmail: no recipient");
  // An address already in "to" is not repeated as a BCC (Brevo rejects a
  // recipient listed twice).
  const toKeys = new Set(toList.map((email) => email.toLowerCase()));
  const bccList = parseEmailList(bcc).filter((email) => !toKeys.has(email.toLowerCase()));

  // Without this, a stalled Brevo API hung the whole request indefinitely
  // -- several callers (OTP signup, checkout) await sendEmail() directly
  // in the request path, not fire-and-forget, so a slow third party
  // became a slow/frozen page for the customer. 10s is generous for a
  // single transactional email send, well under Vercel/Render's own
  // request-duration limits.
  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME,
        email: process.env.MAIL_FROM_EMAIL,
      },
      to: toList.map((email) => ({ email })),
      ...(bccList.length > 0 && {
        bcc: bccList.map((email) => ({ email })),
      }),
      subject,
      htmlContent: wrapEmailHtml(html),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo send failed (${response.status}): ${errorBody}`);
  }
};
