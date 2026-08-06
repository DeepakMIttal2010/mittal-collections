import User from "../models/User.js";
import ReferralSettings from "../models/ReferralSettings.js";

const DEFAULTS = {
  referrerPoints: 100,
  referredPoints: 50,
};

// Returns the single settings doc, creating it with defaults on first use.
export const getReferralSettings = async () => {
  let settings = await ReferralSettings.findOne();
  if (!settings) settings = await ReferralSettings.create(DEFAULTS);
  return settings;
};

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
