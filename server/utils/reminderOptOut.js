import crypto from "crypto";

import User from "../models/User.js";

// Unsubscribe link for the optional reminder emails: abandoned cart,
// wishlist price drop, and the review-collection emails (delivery
// feedback, review request and reminder — see utils/reviewEmails.js).
// Order, payment, OTP, ticket and return emails never check this opt-out.
// Unlike the newsletter link (utils/unsubscribeToken.js,
// email + HMAC in the URL), the URL here carries only a random per-user
// token, so it exposes no email address or user id — and the two kinds
// of link can't stand in for each other. The token is stable once
// created, so the link in an older email keeps working.
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export const isReminderOptOutTokenShape = (token) =>
  typeof token === "string" && TOKEN_PATTERN.test(token);

const getOrCreateToken = async (userId) => {
  const existing = await User.findById(userId).select("+reminderOptOutToken").lean();
  if (existing?.reminderOptOutToken) return existing.reminderOptOutToken;

  const token = crypto.randomBytes(24).toString("hex");
  // Only set when still missing, so two overlapping cron runs agree on
  // one token; re-read whichever one won.
  await User.updateOne(
    { _id: userId, reminderOptOutToken: { $exists: false } },
    { $set: { reminderOptOutToken: token } },
  );
  const saved = await User.findById(userId).select("+reminderOptOutToken").lean();
  return saved?.reminderOptOutToken || null;
};

// Footer paragraph for a reminder email, or "" if no token could be made
// (the email still goes out; the caller has already checked the opt-out).
export const reminderOptOutFooterHtml = async (userId, { lang = "en" } = {}) => {
  let token = null;
  try {
    token = await getOrCreateToken(userId);
  } catch (error) {
    console.error("Reminder opt-out link error:", error.message);
  }
  if (!token) return "";
  const url = `${process.env.CLIENT_URL}/reminders/unsubscribe?t=${token}`;
  if (lang === "hi") {
    return `<p style="font-size:12px;color:#64748b;">कार्ट रिमाइंडर, विशलिस्ट की कीमत घटने वाले, और रिव्यू व फ़ीडबैक ईमेल नहीं चाहिए? <a href="${url}">ये रिमाइंडर बंद करें</a>। इससे आपके न्यूज़लेटर सब्सक्रिप्शन, ऑर्डर और पेमेंट ईमेल पर कोई असर नहीं पड़ेगा।</p>`;
  }
  return `<p style="font-size:12px;color:#64748b;">Don't want cart reminder, wishlist price-drop, or review and feedback emails? <a href="${url}">Unsubscribe from these reminders</a>. This does not change your newsletter subscription. Order and payment emails are not affected.</p>`;
};
