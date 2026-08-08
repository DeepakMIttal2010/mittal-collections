import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import ReferralSettings from "../models/ReferralSettings.js";

let userCounter = 0;

export const createUser = async (overrides = {}) => {
  userCounter += 1;

  return User.create({
    name: "Test User",
    email: `test-user-${userCounter}@example.com`,
    mobile: `90000000${String(userCounter).padStart(2, "0")}`,
    password: "not-used-directly", // login flow isn't under test here
    ...overrides,
  });
};

export const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

export const createCategory = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return Category.create({
    name: `Test Category ${unique}`,
    slug: `test-category-${unique}`,
    image: "https://example.com/image.jpg",
    ...overrides,
  });
};

export const createProduct = async (overrides = {}) => {
  const category = overrides.category || (await createCategory())._id;

  return Product.create({
    name: "Test Product",
    description: "A product used only in automated tests.",
    price: 999,
    image: "https://example.com/product.jpg",
    stock: 10,
    ...overrides,
    category,
  });
};

// Deterministic settings so test assertions don't depend on schema
// defaults that might change independently of these tests.
export const seedLoyaltySettings = async (overrides = {}) =>
  LoyaltySettings.create({
    earnRate: 20,
    redeemValue: 1,
    maxRedeemPercent: 0.5,
    minRedeemPoints: 50,
    expiryMonths: 12,
    ...overrides,
  });

export const seedReferralSettings = async (overrides = {}) =>
  ReferralSettings.create({
    referrerPoints: 100,
    referredPoints: 50,
    ...overrides,
  });
