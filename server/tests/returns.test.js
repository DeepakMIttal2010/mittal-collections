import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { createUser, signToken, createProduct, seedLoyaltySettings } from "./helpers.js";

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

const setReturnStatus = (adminToken, returnId, status) =>
  request(app)
    .put(`/api/returns/${returnId}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

describe("Return approval side effects (stock restore + loyalty clawback)", () => {
  it("restores stock when a return reaches Picked Up", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);
    // stock is now 4 after the order reserved 1

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    const res = await setReturnStatus(adminToken, returnRequest._id, "Picked Up");
    expect(res.status).toBe(200);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(5); // restored back

    const updatedReturn = await ReturnRequest.findById(returnRequest._id);
    expect(updatedReturn.stockRestored).toBe(true);
  });

  it("does not restore stock twice if the status moves Picked Up -> Refunded", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    await setReturnStatus(adminToken, returnRequest._id, "Picked Up");
    await setReturnStatus(adminToken, returnRequest._id, "Refunded");

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(5); // still 5, not 6
  });

  it("restores stock even when jumping straight to Refunded (no separate Picked Up step)", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 1);

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    await setReturnStatus(adminToken, returnRequest._id, "Refunded");

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(5);
  });

  it("claws back only the returned item's proportional share of loyalty points on Refunded", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);

    // Two different-priced items in one order: 1000 + 500 = 1500 subtotal.
    // pointsEarned = floor(1500 / 20) = 75.
    const expensiveProduct = await createProduct({ name: "Expensive", price: 1000, stock: 5 });
    const cheapProduct = await createProduct({ name: "Cheap", price: 500, stock: 5 });

    const placeRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [
          {
            product: expensiveProduct._id.toString(),
            name: expensiveProduct.name,
            image: expensiveProduct.image,
            price: expensiveProduct.price,
            quantity: 1,
          },
          {
            product: cheapProduct._id.toString(),
            name: cheapProduct.name,
            image: cheapProduct.image,
            price: cheapProduct.price,
            quantity: 1,
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

    const userAfterDelivery = await User.findById(user._id);
    expect(userAfterDelivery.loyaltyPoints).toBe(75);

    // Return just the cheap item (500 of the 1500 total = 1/3 share).
    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: cheapProduct._id,
      productName: cheapProduct.name,
      quantity: 1,
      reason: "Wrong size",
    });

    await setReturnStatus(adminToken, returnRequest._id, "Refunded");

    const userAfterReturn = await User.findById(user._id);
    // 75 * (500/1500) = 25 points clawed back -> 50 remain
    expect(userAfterReturn.loyaltyPoints).toBe(50);

    const clawback = await LoyaltyTransaction.findOne({
      user: user._id,
      type: "clawback",
    });
    expect(clawback).not.toBeNull();
    expect(clawback.points).toBe(-25);

    const updatedReturn = await ReturnRequest.findById(returnRequest._id);
    expect(updatedReturn.pointsClawedBack).toBe(true);
  });

  it("does not claw back points if the order was never delivered (nothing was ever earned)", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    // Place but do NOT deliver.
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
    const order = placeRes.body.order;

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Changed my mind",
    });

    await setReturnStatus(adminToken, returnRequest._id, "Refunded");

    const userAfter = await User.findById(user._id);
    expect(userAfter.loyaltyPoints).toBe(0);

    const clawback = await LoyaltyTransaction.findOne({
      user: user._id,
      type: "clawback",
    });
    expect(clawback).toBeNull();
  });
});
