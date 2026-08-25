import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import LoyaltySettings from "../models/LoyaltySettings.js";
import ReferralSettings from "../models/ReferralSettings.js";
import SiteSettings from "../models/SiteSettings.js";

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

// Most tests that place a COD order care about some other computation
// (discounts, points, revenue) and don't want the ₹50 COD charge (see
// SiteSettings.codCharge) skewing their expected totals — call this with
// codCharge: 0 to keep those numbers clean, or with no args/overrides to
// exercise the real default. Upserts rather than blind-creates so calling
// it more than once per test (e.g. a shared placeOrder helper) doesn't
// leave multiple SiteSettings docs behind for createOrder's
// SiteSettings.findOne() to pick between unpredictably.
// A Delivered order for the given user/products — used by review tests
// that need submitReview to be able to link a review back to an order
// (e.g. the per-order loyalty-bonus cap).
export const createOrder = async ({ user, products, overrides = {} }) =>
  Order.create({
    user: user._id,
    orderItems: products.map((product) => ({
      product: product._id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity: 1,
    })),
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    totalPrice: products.reduce((sum, p) => sum + p.price, 0),
    orderStatus: "Delivered",
    ...overrides,
  });

export const seedSiteSettings = async (overrides = {}) =>
  SiteSettings.findOneAndUpdate(
    {},
    { $setOnInsert: { codCharge: 50, ...overrides } },
    { upsert: true, new: true },
  );
