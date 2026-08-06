import User from "../models/User.js";

export const REFERRER_REWARD_POINTS = 100;
export const REFERRED_REWARD_POINTS = 50;

const randomSuffix = () =>
  Math.random().toString(36).slice(2, 6).toUpperCase();

const baseCodeFromName = (name) => {
  const letters = (name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);

  return letters || "USER";
};

// Generates a short, human-shareable code like "DEEPGT4X", retrying on
// the rare collision.
export const generateUniqueReferralCode = async (name) => {
  const base = baseCodeFromName(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${base}${randomSuffix()}`;
    const existing = await User.findOne({ referralCode: code });
    if (!existing) return code;
  }

  return `${base}${Date.now().toString(36).toUpperCase()}`;
};
