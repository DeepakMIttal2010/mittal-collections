import Subscriber from "../models/Subscriber.js";
import { sendEmail } from "../config/mailer.js";
import { createUnsubscribeToken, isValidUnsubscribeToken } from "../utils/unsubscribeToken.js";

// Was a single regex with 3 quantified groups over overlapping character
// classes -- CodeQL flagged this as polynomial-backtracking-prone on
// adversarial input (see productController.js's isValidEmail, same fix
// mirrored here). Splitting on the LAST "@" with a plain string op first
// does the same structural check with no backtracking possible.
const isValidEmail = (email) => {
  if (!email || typeof email !== "string" || email.length > 254) return false;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return false;
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);
  if (/\s/.test(localPart) || /\s/.test(domainPart)) return false;
  if (!domainPart.includes(".")) return false;
  if (domainPart.startsWith(".") || domainPart.endsWith(".")) return false;
  return true;
};

// ============================
// SUBSCRIBE TO NEWSLETTER
// ============================
export const subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await Subscriber.findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "You're already subscribed",
      });
    }

    await Subscriber.create({ email: normalizedEmail });

    res.status(201).json({
      success: true,
      message: "Subscribed successfully",
    });
  } catch (error) {
    // Two concurrent submits for the same email (double-click, a
    // client-side double POST) can both pass the findOne pre-check
    // above before either write lands — the loser hits the unique
    // index and gets a duplicate-key error here rather than a real
    // failure. Same email really is subscribed either way, so this
    // should read as success, not a generic 500.
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "You're already subscribed",
      });
    }

    console.error("Newsletter Subscribe Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to subscribe. Please try again.",
    });
  }
};

// ============================
// UNSUBSCRIBE FROM NEWSLETTER (Public)
// No login possible here (Subscriber has no password) -- the token
// proves the request came from a link this app actually sent, see
// unsubscribeToken.js.
// ============================
export const unsubscribe = async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isValidUnsubscribeToken(normalizedEmail, token)) {
      return res.status(400).json({
        success: false,
        message: "This unsubscribe link is invalid or has expired",
      });
    }

    await Subscriber.deleteOne({ email: normalizedEmail });

    res.status(200).json({
      success: true,
      message: "You've been unsubscribed",
    });
  } catch (error) {
    console.error("Newsletter Unsubscribe Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPLOAD CAMPAIGN IMAGE (Admin)
// Uploads an image for use inside a newsletter message body and
// returns its hosted URL. No DB record is created.
// ============================
export const uploadCampaignImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    res.status(200).json({
      success: true,
      url: req.file.path,
    });
  } catch (error) {
    console.error("Upload Campaign Image Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL SUBSCRIBERS (Admin)
// ============================
export const getSubscribers = async (req, res) => {
  try {
    // Safety ceiling, not real pagination — see orderController.js's
    // getAllOrders for why this pattern was chosen here over a full
    // pagination rework. sendCampaign below deliberately does NOT get
    // this same cap — a newsletter send has to reach every subscriber,
    // not just the first 2000, so silently truncating that list would be
    // a real (and much worse) bug, not a safety improvement.
    const subscribers = await Subscriber.find({})
      .sort({ createdAt: -1 })
      .limit(2000);

    res.status(200).json({
      success: true,
      subscribers,
      total: subscribers.length,
    });
  } catch (error) {
    console.error("Get Subscribers Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// A double-click or a retried POST (slow network, admin impatience) used
// to loop over the full subscriber list twice with nothing stopping it —
// unlike every cron-driven sender in this codebase, this admin-triggered
// send had no idempotency guard at all, so the entire mailing list could
// get the same campaign emailed twice. There's no persisted "Campaign"
// record this could key an atomic DB claim against (subject/html are
// passed in ad-hoc, not saved first), so this is a simple in-process
// lock instead -- sufficient for the actual double-click/retry scenario
// on this single-instance deployment, without building out a full
// campaign-tracking feature for it (deep bug sweep, 2026-10-20).
let campaignInProgress = false;

// ============================
// SEND NEWSLETTER CAMPAIGN (Admin)
// Emails every subscriber one by one. Failures are collected and
// reported back rather than aborting the whole send.
// ============================
export const sendCampaign = async (req, res) => {
  if (campaignInProgress) {
    return res.status(409).json({
      success: false,
      message: "A campaign is already being sent. Please wait for it to finish.",
    });
  }

  campaignInProgress = true;

  try {
    const { subject, html } = req.body;

    if (!subject || !html) {
      return res.status(400).json({
        success: false,
        message: "Subject and content are required",
      });
    }

    const subscribers = await Subscriber.find({});

    if (subscribers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "There are no subscribers yet",
      });
    }

    let sent = 0;
    const failed = [];

    for (const subscriber of subscribers) {
      try {
        // Per-subscriber, not a shared footer appended once -- the
        // token is keyed on each subscriber's own email, so the same
        // link can't be used to unsubscribe someone else.
        const unsubscribeUrl = `${process.env.CLIENT_URL}/newsletter/unsubscribe?email=${encodeURIComponent(subscriber.email)}&token=${createUnsubscribeToken(subscriber.email)}`;
        const htmlWithFooter = `${html}<p style="margin-top:32px;font-size:12px;color:#94a3b8;">You're receiving this because you subscribed to Mittal Collections updates. <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p>`;

        await sendEmail({ to: subscriber.email, subject, html: htmlWithFooter });
        sent += 1;
      } catch (error) {
        console.error(`Newsletter send failed for ${subscriber.email}:`, error);
        failed.push(subscriber.email);
      }
    }

    res.status(200).json({
      success: true,
      message: `Sent to ${sent} of ${subscribers.length} subscribers`,
      sent,
      total: subscribers.length,
      failed,
    });
  } catch (error) {
    console.error("Send Campaign Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  } finally {
    campaignInProgress = false;
  }
};
