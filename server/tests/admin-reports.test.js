import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import {
  createUser,
  signToken,
  createProduct,
  seedSiteSettings,
  seedLoyaltySettings,
} from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

// Places a COD order with the COD charge zeroed out (subtotal >= 499 so
// delivery fee is 0 too — totalPrice equals the product price exactly),
// then backdates its createdAt. Stays on COD rather than Razorpay: there's
// no Razorpay test credentials in this environment, so a real Razorpay
// order attempt always fails.
const placeOrderOnDate = async (token, product, daysAgo) => {
  await seedSiteSettings({ codCharge: 0 });

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
          quantity: 1,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
    });

  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(res.body.order._id) },
    { $set: { createdAt: date } },
  );

  return res.body.order;
};

describe("GET /api/admin/reports — date-range scoping", () => {
  it("scopes totalOrders and totalRevenue to the selected day range by default (30 days)", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const customer = await createUser();
    const customerToken = signToken(customer);
    const product = await createProduct({ price: 1000, stock: 10 });

    await placeOrderOnDate(customerToken, product, 2); // within 30 days
    await placeOrderOnDate(customerToken, product, 40); // outside 30 days

    const res = await request(app)
      .get("/api/admin/reports?days=30")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalOrders).toBe(1);
    expect(res.body.summary.totalRevenue).toBe(1000);
  });

  it("includes both orders once the range is widened to cover them", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const customer = await createUser();
    const customerToken = signToken(customer);
    const product = await createProduct({ price: 1000, stock: 10 });

    await placeOrderOnDate(customerToken, product, 2);
    await placeOrderOnDate(customerToken, product, 40);

    const res = await request(app)
      .get("/api/admin/reports?days=90")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.summary.totalOrders).toBe(2);
    expect(res.body.summary.totalRevenue).toBe(2000);
  });

  it("scopes correctly to a custom startDate/endDate range", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const customer = await createUser();
    const customerToken = signToken(customer);
    const product = await createProduct({ price: 1000, stock: 10 });

    await placeOrderOnDate(customerToken, product, 2);
    await placeOrderOnDate(customerToken, product, 40);

    const start = new Date();
    start.setDate(start.getDate() - 45);
    const end = new Date();
    end.setDate(end.getDate() - 35);

    const res = await request(app)
      .get(
        `/api/admin/reports?startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}`,
      )
      .set("Authorization", `Bearer ${adminToken}`);

    // Only the 40-day-old order falls inside this window.
    expect(res.body.summary.totalOrders).toBe(1);
    expect(res.body.summary.totalRevenue).toBe(1000);
  });

  it("keeps totalCustomers all-time regardless of the selected day range (documented exception)", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    await createUser();
    await createUser();
    await createUser();

    const narrow = await request(app)
      .get("/api/admin/reports?days=7")
      .set("Authorization", `Bearer ${adminToken}`);
    const wide = await request(app)
      .get("/api/admin/reports?days=90")
      .set("Authorization", `Bearer ${adminToken}`);

    // 3 customers created above, plus the admin doesn't count (role: admin).
    expect(narrow.body.summary.totalCustomers).toBe(3);
    expect(wide.body.summary.totalCustomers).toBe(3);
  });

  it("nets out clawback so a delivered-then-cancelled order doesn't inflate Points Earned", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const customer = await createUser();
    const customerToken = signToken(customer);
    const product = await createProduct({ price: 500, stock: 5 });

    const order = await placeOrderOnDate(customerToken, product, 2);

    // pointsEarnedFor(500, 20) = 25 — credited on Delivered, then reversed
    // via a clawback transaction when the same order is later Cancelled.
    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Delivered" });

    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Cancelled" });

    const res = await request(app)
      .get("/api/admin/reports?days=30")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.loyalty.pointsEarned).toBe(0);
  });
});
