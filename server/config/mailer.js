// Sends email via Brevo's HTTP API instead of raw SMTP — Render's free
// tier blocks outbound SMTP ports, but HTTPS API calls go through fine.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export const sendEmail = async ({ to, subject, html }) => {
  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME,
        email: process.env.MAIL_FROM_EMAIL,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo send failed (${response.status}): ${errorBody}`);
  }
};
