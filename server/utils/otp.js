import bcrypt from "bcryptjs";
import crypto from "crypto";
import Otp from "../models/Otp.js";
import { sendEmail } from "../config/mailer.js";

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const generateCode = () =>
  crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");

// Creates (or replaces) a pending OTP for target+purpose and emails it.
// `payload` is whatever the caller needs to act on once the code is
// verified — never persisted to the real collection until then.
export const createAndSendOtp = async ({
  target,
  purpose,
  payload = null,
  bcc,
  // No User account exists yet at this point for a registration OTP
  // (that's the whole point of OTP-gating account creation), so there's
  // no stored preferredLanguage to read -- the caller passes along
  // whatever the storefront's own language toggle was set to at the
  // moment the form was submitted.
  language = "en",
}) => {
  const code = generateCode();
  const otpHash = await bcrypt.hash(code, 10);

  await Otp.deleteMany({ target, purpose });

  await Otp.create({
    target,
    purpose,
    otpHash,
    payload,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  const isHindi = language === "hi";

  await sendEmail({
    to: target,
    bcc,
    subject: isHindi
      ? "आपका Mittal Collections वेरिफिकेशन कोड"
      : "Your Mittal Collections verification code",
    html: isHindi
      ? `
      <p>आपका वेरिफिकेशन कोड है:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>यह कोड ${OTP_TTL_MINUTES} मिनट में समाप्त हो जाएगा। अगर आपने यह रिक्वेस्ट नहीं की है, तो इस ईमेल को नज़रअंदाज़ करें।</p>
    `
      : `
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
};

// Returns { success, message, payload } — payload is only present on
// success, so the caller can act on it without a second lookup.
export const verifyOtp = async ({ target, purpose, code }) => {
  const otpDoc = await Otp.findOne({ target, purpose }).sort({
    _id: -1,
  });

  if (!otpDoc) {
    return { success: false, message: "No verification code found. Please request a new one." };
  }

  if (otpDoc.expiresAt < new Date()) {
    await otpDoc.deleteOne();
    return { success: false, message: "This code has expired. Please request a new one." };
  }

  if (otpDoc.attempts >= MAX_ATTEMPTS) {
    await otpDoc.deleteOne();
    return { success: false, message: "Too many incorrect attempts. Please request a new code." };
  }

  const isMatch = await bcrypt.compare(code, otpDoc.otpHash);

  if (!isMatch) {
    otpDoc.attempts += 1;
    await otpDoc.save();
    return { success: false, message: "Incorrect code. Please try again." };
  }

  const { payload } = otpDoc;
  await otpDoc.deleteOne();

  return { success: true, payload };
};
