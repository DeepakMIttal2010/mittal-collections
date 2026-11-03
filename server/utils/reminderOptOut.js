import crypto from "crypto";

import User from "../models/User.js";

// Unsubscribe link for the two reminder emails (abandoned cart, wishlist
// price drop). Unlike the newsletter link (utils/unsubscribeToken.js,
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
export const reminderOptOutFooterHtml = async (userId) => {
  let token = null;
  try {
    token = await getOrCreateToken(userId);
  } catch (error) {
    console.error("Reminder opt-out link error:", error.message);
  }
  if (!token) return "";
  const url = `${process.env.CLIENT_URL}/reminders/unsubscribe?t=${token}`;
  return `<p style="font-size:12px;color:#64748b;">Don't want cart and wishlist price-drop reminders? <a href="${url}">Unsubscribe from these reminders</a>. This does not change your newsletter subscription.</p>`;
};
