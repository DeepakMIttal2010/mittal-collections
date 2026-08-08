import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import SiteSettings from "../models/SiteSettings.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeAndDeliverOrder = async (token, adminToken, product, quantity = 1) => {
  const placeRes = await request(app)
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
    });

  const order = placeRes.body.order;

  await request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "Delivered" });

  return order;
};

const requestReturn = (token, body) =>
  request(app)
    .post("/api/returns")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("Return request eligibility", () => {
  it("rejects a return on an order that isn't Delivered yet", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 5 });

    const placeRes = await request(app)
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

    const res = await requestReturn(token, {
      orderId: placeRes.body.order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Too early",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delivered orders/i);
  });

  it("rejects a return for a product that isn't part of the order", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });
    const otherProduct = await createProduct({ price: 500, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const res = await requestReturn(token, {
      orderId: order._id,
      productId: otherProduct._id.toString(),
      quantity: 1,
      reason: "Not mine",
    });

    expect(res.status).toBe(404);
  });

  it("rejects a return on a product marked non-returnable", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({
      price: 1000,
      stock: 5,
      isReturnable: false,
    });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const res = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Changed my mind",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not eligible for return/i);
  });

  it("accepts a return within the product's own returnPeriodDays override", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    // Product overrides the return window to 3 days, ignoring any site default.
    const product = await createProduct({
      price: 1000,
      stock: 5,
      returnPeriodDays: 3,
    });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const res = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Wrong size",
    });

    expect(res.status).toBe(201);
    expect(res.body.returnRequest.status).toBe("Requested");
  });

  it("rejects a return once the product's own returnPeriodDays window has closed", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({
      price: 1000,
      stock: 5,
      returnPeriodDays: 3,
    });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    // Backdate delivery to 5 days ago — past the 3-day window.
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await Order.findByIdAndUpdate(order._id, { deliveredAt: fiveDaysAgo });

    const res = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Too late",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/return window/i);
  });

  it("falls back to SiteSettings.defaultReturnPeriodDays when the product has no override", async () => {
    await SiteSettings.create({ defaultReturnPeriodDays: 2 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    // returnPeriodDays: 0 means "use the site default" per the model's own convention.
    const product = await createProduct({
      price: 1000,
      stock: 5,
      returnPeriodDays: 0,
    });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await Order.findByIdAndUpdate(order._id, { deliveredAt: threeDaysAgo });

    // 3 days ago is past the 2-day site default -> should be rejected.
    const res = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Too late",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/return window/i);
  });

  it("blocks a second return request for the same order+product while one is already active", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const first = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Wrong item",
    });
    expect(first.status).toBe(201);

    const second = await requestReturn(token, {
      orderId: order._id,
      productId: product._id.toString(),
      quantity: 1,
      reason: "Trying again",
    });

    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already exists/i);
  });
});
