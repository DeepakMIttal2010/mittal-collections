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
export const createAndSendOtp = async ({ target, purpose, payload = null }) => {
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

  await sendEmail({
    to: target,
    subject: "Your Mittal Collections verification code",
    html: `
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
