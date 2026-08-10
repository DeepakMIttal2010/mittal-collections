import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { expireInactivePoints } from "../utils/loyaltyPoints.js";
import {
  createUser,
  signToken,
  createProduct,
  seedLoyaltySettings,
  seedReferralSettings,
} from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeOrder = async (token, product, quantity = 1, extra = {}) => {
  const res = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: product.price,
          quantity,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
      ...extra,
    });

  return res.body.order;
};

const setStatus = (adminToken, orderId, status) =>
  request(app)
    .put(`/api/orders/${orderId}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

describe("Loyalty points on order delivery/cancellation", () => {
  it("credits points once when an order is marked Delivered (earnRate: ₹20/point)", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeOrder(token, product, 1);

    const res = await setStatus(adminToken, order._id, "Delivered");
    expect(res.status).toBe(200);

    const updatedUser = await User.findById(user._id);
    // totalPrice 1000 (>=499 threshold, so no delivery fee) / earnRate 20 = 50 points
    expect(updatedUser.loyaltyPoints).toBe(50);

    const ledger = await LoyaltyTransaction.find({ user: user._id });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("earned");
    expect(ledger[0].points).toBe(50);
    expect(ledger[0].balanceAfter).toBe(50);
  });

  it("does not double-credit if Delivered is set twice", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeOrder(token, product, 1);

    await setStatus(adminToken, order._id, "Delivered");
    await setStatus(adminToken, order._id, "Delivered");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(50);

    const ledger = await LoyaltyTransaction.find({ user: user._id });
    expect(ledger).toHaveLength(1);
  });

  it("claws back earned points when a delivered order is later cancelled (balance must decrease, not increase)", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeOrder(token, product, 1);

    await setStatus(adminToken, order._id, "Delivered");
    let updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(50);

    await setStatus(adminToken, order._id, "Cancelled");
    updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(0);

    const clawback = await LoyaltyTransaction.findOne({
      user: user._id,
      type: "clawback",
    });
    expect(clawback).not.toBeNull();
    expect(clawback.points).toBe(-50);
  });

  it("refunds only redeemed points (no clawback) when a pending order is cancelled", async () => {
    await seedLoyaltySettings({
      earnRate: 20,
      redeemValue: 1,
      maxRedeemPercent: 0.5,
      minRedeemPoints: 1,
    });

    const user = await createUser({ loyaltyPoints: 100 });
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeOrder(token, product, 1, { redeemPoints: 40 });
    expect(order.pointsRedeemed).toBe(40);

    let updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(60); // 100 - 40 redeemed

    await setStatus(adminToken, order._id, "Cancelled");

    updatedUser = await User.findById(user._id);
    // Refunded the 40 redeemed points; nothing was ever earned on a
    // pending order, so there must be no clawback transaction.
    expect(updatedUser.loyaltyPoints).toBe(100);

    const clawback = await LoyaltyTransaction.findOne({
      user: user._id,
      type: "clawback",
    });
    expect(clawback).toBeNull();
  });

  it("caps point redemption at maxRedeemPercent of the order subtotal", async () => {
    await seedLoyaltySettings({
      earnRate: 20,
      redeemValue: 1,
      maxRedeemPercent: 0.5,
      minRedeemPoints: 1,
    });

    const user = await createUser({ loyaltyPoints: 1000 });
    const token = signToken(user);
    // subtotal 1000 -> cap is 50% * 1000 / redeemValue(1) = 500 points
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeOrder(token, product, 1, { redeemPoints: 900 });

    expect(order.pointsRedeemed).toBe(500);
    expect(order.pointsDiscount).toBe(500);
    expect(order.totalPrice).toBe(500); // 1000 subtotal - 500 points discount
  });

  it("pays out the referral bonus to both sides on the referred user's first delivered order, exactly once", async () => {
    await seedLoyaltySettings({ earnRate: 20 });
    await seedReferralSettings({ referrerPoints: 100, referredPoints: 50 });

    const referrer = await createUser();
    const referred = await createUser({
      referredBy: referrer._id,
      referralRewarded: false,
    });
    const admin = await createUser({ role: "admin" });
    const referredToken = signToken(referred);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 10 });

    const firstOrder = await placeOrder(referredToken, product, 1);
    await setStatus(adminToken, firstOrder._id, "Delivered");

    const referrerAfterFirst = await User.findById(referrer._id);
    const referredAfterFirst = await User.findById(referred._id);
    expect(referrerAfterFirst.loyaltyPoints).toBe(100);
    // 50 points earned on the order itself (1000/20) + 50 referral bonus
    expect(referredAfterFirst.loyaltyPoints).toBe(100);
    expect(referredAfterFirst.referralRewarded).toBe(true);

    // A second delivered order for the same referred user must NOT pay
    // the referral bonus again.
    const secondOrder = await placeOrder(referredToken, product, 1);
    await setStatus(adminToken, secondOrder._id, "Delivered");

    const referrerAfterSecond = await User.findById(referrer._id);
    expect(referrerAfterSecond.loyaltyPoints).toBe(100); // unchanged
  });
});

describe("expireInactivePoints", () => {
  // Regression test: a customer with only an admin-credited balance
  // (no order-based "earned" transaction ever) had their points
  // auto-expired the very next day, because the expiry job only
  // recognized "earned"/"referral_bonus" as recent activity —
  // "admin_adjustment" didn't count, so a user with no other history
  // looked stale immediately. Fixed by keying off `points > 0`
  // (any type) instead of a fixed type list.
  it("does not expire a balance that was credited via a recent admin adjustment, even with no prior earning history", async () => {
    await seedLoyaltySettings({ expiryMonths: 12 });

    const user = await createUser({ loyaltyPoints: 100 });
    await LoyaltyTransaction.create({
      user: user._id,
      type: "admin_adjustment",
      points: 100,
      balanceAfter: 100,
      description: "Welcome point",
    });

    const expiredCount = await expireInactivePoints();

    expect(expiredCount).toBe(0);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(100);
  });

  it("expires a balance whose only activity is a stale (>expiryMonths old) transaction", async () => {
    await seedLoyaltySettings({ expiryMonths: 12 });

    const user = await createUser({ loyaltyPoints: 50 });
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    await LoyaltyTransaction.create({
      user: user._id,
      type: "earned",
      points: 50,
      balanceAfter: 50,
      createdAt: thirteenMonthsAgo,
    });

    const expiredCount = await expireInactivePoints();

    expect(expiredCount).toBe(1);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(0);

    const expiredTxn = await LoyaltyTransaction.findOne({
      user: user._id,
      type: "expired",
    });
    expect(expiredTxn.points).toBe(-50);
  });

  it("does not let a negative admin adjustment (deduction) reset the staleness clock", async () => {
    await seedLoyaltySettings({ expiryMonths: 12 });

    const user = await createUser({ loyaltyPoints: 30 });
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    await LoyaltyTransaction.create({
      user: user._id,
      type: "earned",
      points: 50,
      balanceAfter: 50,
      createdAt: thirteenMonthsAgo,
    });
    // A recent deduction shouldn't count as "recent activity" that
    // earns the balance a reprieve.
    await LoyaltyTransaction.create({
      user: user._id,
      type: "admin_adjustment",
      points: -20,
      balanceAfter: 30,
    });

    const expiredCount = await expireInactivePoints();

    expect(expiredCount).toBe(1);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.loyaltyPoints).toBe(0);
  });
});
