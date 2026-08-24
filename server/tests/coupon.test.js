import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Coupon from "../models/Coupon.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeOrder = async (token, product, extra = {}) => {
  // These tests are about discount math, not payment method or the COD
  // charge — zero it out so it doesn't skew the exact totalPrice numbers
  // asserted below. (Razorpay isn't an option here: there's no Razorpay
  // test credentials in this environment, so a real Razorpay order
  // attempt always fails.)
  await seedSiteSettings({ codCharge: 0 });

  return request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 1,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
      ...extra,
    });
};

describe("POST /api/coupons/validate", () => {
  it("rejects an unknown or inactive code", async () => {
    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "DOESNOTEXIST", subtotal: 1000 });

    expect(res.status).toBe(404);
  });

  it("caps a percentage discount at the coupon's maxDiscount", async () => {
    await Coupon.create({
      code: "SAVE20",
      discountType: "percentage",
      discountValue: 20,
      maxDiscount: 150,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);

    // 20% of 2000 = 400, but capped at maxDiscount 150.
    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "save20", subtotal: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe(150);
  });

  it("caps a flat discount at the subtotal so it can never go negative", async () => {
    await Coupon.create({
      code: "FLAT500",
      discountType: "flat",
      discountValue: 500,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "FLAT500", subtotal: 300 });

    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe(300);
  });

  it("rejects a first-order-only coupon for a customer who already has an order", async () => {
    await Coupon.create({
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      firstOrderOnly: true,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 5 });

    // Place one order first so this is no longer their first order.
    await placeOrder(token, product);

    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "WELCOME10", subtotal: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/first order/i);
  });

  it("accepts a first-order-only coupon for a customer with no prior orders", async () => {
    await Coupon.create({
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      firstOrderOnly: true,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "WELCOME10", subtotal: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe(100);
  });

  it("stays eligible for a first-order-only coupon if their only prior order was Cancelled", async () => {
    await Coupon.create({
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      firstOrderOnly: true,
      isActive: true,
    });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const placeRes = await placeOrder(token, product);

    await request(app)
      .put(`/api/orders/${placeRes.body.order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Cancelled" });

    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "WELCOME10", subtotal: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe(100);
  });
});

describe("Coupon application during order placement", () => {
  it("applies a valid coupon's discount to the order total", async () => {
    await Coupon.create({
      code: "SAVE20",
      discountType: "percentage",
      discountValue: 20,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 5 });

    const res = await placeOrder(token, product, { couponCode: "save20" });

    expect(res.status).toBe(201);
    expect(res.body.order.couponCode).toBe("SAVE20");
    expect(res.body.order.discountAmount).toBe(200);
    expect(res.body.order.totalPrice).toBe(800); // 1000 - 200, subtotal clears free-shipping threshold
  });

  it("silently ignores an invalid coupon code rather than failing the order", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 5 });

    const res = await placeOrder(token, product, { couponCode: "NOTREAL" });

    expect(res.status).toBe(201);
    expect(res.body.order.couponCode).toBeNull();
    expect(res.body.order.discountAmount).toBe(0);
    expect(res.body.order.totalPrice).toBe(1000);
  });

  it("does not apply a first-order-only coupon for a repeat customer, even if they send the code", async () => {
    await Coupon.create({
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      firstOrderOnly: true,
      isActive: true,
    });

    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 5 });

    await placeOrder(token, product); // first order, no coupon
    const second = await placeOrder(token, product, { couponCode: "WELCOME10" });

    expect(second.status).toBe(201);
    expect(second.body.order.couponCode).toBeNull();
    expect(second.body.order.discountAmount).toBe(0);
  });
});
