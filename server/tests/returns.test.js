import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { creditDueOrderPoints } from "../utils/loyaltyPoints.js";
import {
  createUser,
  signToken,
  createProduct,
  createOrder,
  seedLoyaltySettings,
  seedSiteSettings,
} from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeAndDeliverOrder = async (token, adminToken, product, quantity = 1) => {
  // These tests are about return/loyalty-clawback math, not the COD
  // charge — zero it out so it doesn't skew the exact totalPrice/points
  // numbers asserted below.
  await seedSiteSettings({ codCharge: 0 });

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
    // Not testing the COD charge here — zero it out.
    await seedSiteSettings({ codCharge: 0 });

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

    // Points stay pending through the return window, then the loyalty
    // job credits them.
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);
    await creditDueOrderPoints({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) });

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

describe("Cancelling a delivered order after a return (round 29)", () => {
  it("puts back only the pieces the return didn't already restock", async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 3); // stock 5 -> 2

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });
    await setReturnStatus(adminToken, returnRequest._id, "Refunded"); // 1 back -> 3
    expect((await Product.findById(product._id)).stock).toBe(3);

    const cancel = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Cancelled" });
    expect(cancel.status).toBe(200);

    // the other 2 come back; the returned one must not be counted twice
    expect((await Product.findById(product._id)).stock).toBe(5);
  });
});

describe("Return status transition guard", () => {
  it("rejects a Rejected -> Refunded jump (would phantom-restock an item never accepted back)", async () => {
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

    await setReturnStatus(adminToken, returnRequest._id, "Rejected");

    const res = await setReturnStatus(adminToken, returnRequest._id, "Refunded");
    expect(res.status).toBe(400);

    const updatedReturn = await ReturnRequest.findById(returnRequest._id);
    expect(updatedReturn.status).toBe("Rejected");
    expect(updatedReturn.stockRestored).toBe(false);
    expect(updatedReturn.pointsClawedBack).toBe(false);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(4); // unchanged, not phantom-restocked
  });

  it("allows a same-status self-loop as a harmless no-op", async () => {
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

    const res = await setReturnStatus(adminToken, returnRequest._id, "Requested");
    expect(res.status).toBe(200);
  });
});

describe("An open return on an order that was cancelled afterwards (M1-A)", () => {
  // Delivered order of 3 (stock 5 -> 2), a return requested but not yet
  // picked up, then the whole order cancelled (all 3 back -> 5).
  const cancelledWithOpenReturn = async () => {
    await seedLoyaltySettings({ earnRate: 20 });

    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const order = await placeAndDeliverOrder(token, adminToken, product, 3);
    expect((await Product.findById(product._id)).stock).toBe(2);

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    const cancel = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Cancelled" });
    expect(cancel.status).toBe(200);

    // Baseline after the cancellation, so the assertions below check only
    // what the later return transition does.
    const baseline = {
      stock: (await Product.findById(product._id)).stock,
      points: (await User.findById(user._id)).loyaltyPoints,
      ledgerEntries: await LoyaltyTransaction.countDocuments({ user: user._id }),
      refundedAmount: (await Order.findById(order._id)).refundedAmount || 0,
    };
    expect(baseline.stock).toBe(5);

    return { user, adminToken, product, order, returnRequest, baseline };
  };

  const expectUnchanged = async ({ user, product, order, returnRequest, baseline }, status) => {
    expect((await Product.findById(product._id)).stock).toBe(baseline.stock);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(baseline.points);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id })).toBe(baseline.ledgerEntries);
    expect((await Order.findById(order._id)).refundedAmount || 0).toBe(baseline.refundedAmount);
    const rr = await ReturnRequest.findById(returnRequest._id);
    expect(rr.status).toBe(status);
    expect(rr.stockRestored).toBe(false);
    expect(rr.pointsClawedBack).toBe(false);
  };

  it("A. Picked Up after the cancellation is refused (409) and stock stays 5", async () => {
    const setup = await cancelledWithOpenReturn();

    const res = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Picked Up");

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/cancel/i);
    await expectUnchanged(setup, "Requested");
  });

  it("B. Refunded after the cancellation is refused (409): no restock, no clawback, no refundedAmount", async () => {
    const setup = await cancelledWithOpenReturn();

    const res = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Refunded");

    expect(res.status).toBe(409);
    await expectUnchanged(setup, "Requested");
  });

  it("C1. the open return can still be Rejected, with no stock or points effect", async () => {
    const setup = await cancelledWithOpenReturn();

    const res = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Rejected");

    expect(res.status).toBe(200);
    await expectUnchanged(setup, "Rejected");
  });

  it("C2. on an order that is NOT cancelled, Picked Up -> Refunded still works and restocks once", async () => {
    await seedLoyaltySettings({ earnRate: 20 });
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });
    const order = await placeAndDeliverOrder(signToken(user), adminToken, product, 3); // 2 left

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    expect((await setReturnStatus(adminToken, returnRequest._id, "Picked Up")).status).toBe(200);
    expect((await setReturnStatus(adminToken, returnRequest._id, "Refunded")).status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(3);
  });

  it("D. a return already Picked Up BEFORE the cancellation can still be Refunded: no second restock or clawback", async () => {
    await seedLoyaltySettings({ earnRate: 20 });
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });
    const order = await placeAndDeliverOrder(signToken(user), adminToken, product, 3); // 5 -> 2

    const returnRequest = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Didn't like it",
    });

    expect((await setReturnStatus(adminToken, returnRequest._id, "Picked Up")).status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(3);
    expect((await ReturnRequest.findById(returnRequest._id)).stockRestored).toBe(true);

    const cancel = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Cancelled" });
    expect(cancel.status).toBe(200);

    // After the cancellation: the 2 kept pieces came back, the returned one
    // wasn't counted twice.
    const baseline = {
      stock: (await Product.findById(product._id)).stock,
      points: (await User.findById(user._id)).loyaltyPoints,
      ledgerEntries: await LoyaltyTransaction.countDocuments({ user: user._id }),
      refundedAmount: (await Order.findById(order._id)).refundedAmount || 0,
    };
    expect(baseline.stock).toBe(5);

    const res = await setReturnStatus(adminToken, returnRequest._id, "Refunded");

    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(baseline.stock);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(baseline.points);
    expect(await LoyaltyTransaction.countDocuments({ user: user._id })).toBe(baseline.ledgerEntries);
    // The existing refund bookkeeping still records the returned item's value
    // (₹1000 x 1, no order discount) on the order; revenue reports already
    // leave Cancelled orders out.
    expect((await Order.findById(order._id)).refundedAmount).toBe(baseline.refundedAmount + 1000);
    const rr = await ReturnRequest.findById(returnRequest._id);
    expect(rr.status).toBe("Refunded");
    expect(rr.stockRestored).toBe(true);
    expect(rr.pointsClawedBack).toBe(true);
  });
});

describe("Returns on an order with the same product in more than one size (M1-B)", () => {
  const lineFor = (product, size, price, quantity) => ({
    product: product._id,
    name: product.name,
    image: product.image,
    price,
    quantity,
    size,
  });

  // One product bought in two sizes: Double 2 x 800 and King 1 x 1200.
  const twoSizeOrder = async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({
      price: 800,
      stock: 20,
      variants: [
        { size: "Double", price: 800, stock: 10 },
        { size: "King", price: 1200, stock: 10 },
      ],
    });
    const order = await createOrder({
      user,
      products: [product],
      overrides: {
        orderItems: [lineFor(product, "Double", 800, 2), lineFor(product, "King", 1200, 1)],
        totalPrice: 2800,
        paymentMethod: "COD",
        deliveredAt: new Date(),
      },
    });

    return { user, token: signToken(user), adminToken: signToken(admin), product, order };
  };

  const requestReturn = (token, body) =>
    request(app).post("/api/returns").set("Authorization", `Bearer ${token}`).send(body);

  const returnBody = ({ order, product }, extra = {}) => ({
    orderId: order._id.toString(),
    productId: product._id.toString(),
    quantity: 5,
    reason: "Wrong size",
    ...extra,
  });

  it("returns the size the customer picked, capped at that line's quantity", async () => {
    const setup = await twoSizeOrder();

    const res = await requestReturn(setup.token, returnBody(setup, { size: "King" }));

    expect(res.status).toBe(201);
    expect(res.body.returnRequest.size).toBe("King");
    expect(res.body.returnRequest.quantity).toBe(1);
  });

  it("lets each size of the same product be returned on its own", async () => {
    const setup = await twoSizeOrder();

    const double = await requestReturn(setup.token, returnBody(setup, { size: "Double" }));
    const king = await requestReturn(setup.token, returnBody(setup, { size: "King" }));

    expect(double.status).toBe(201);
    expect(king.status).toBe(201);
    const sizes = (await ReturnRequest.find({ order: setup.order._id }).lean()).map((r) => r.size).sort();
    expect(sizes).toEqual(["Double", "King"]);
  });

  it("asks which size when the product is on the order in more than one size and none is given", async () => {
    const setup = await twoSizeOrder();

    const res = await requestReturn(setup.token, returnBody(setup));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/size/i);
    expect(await ReturnRequest.countDocuments({})).toBe(0);
  });

  it("refuses a size that is not on the order", async () => {
    const setup = await twoSizeOrder();

    const res = await requestReturn(setup.token, returnBody(setup, { size: "Single" }));

    expect(res.status).toBe(404);
    expect(await ReturnRequest.countDocuments({})).toBe(0);
  });

  it("still accepts a request without a size when the product has only one line (older clients)", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const order = await createOrder({
      user,
      products: [product],
      overrides: { paymentMethod: "COD", deliveredAt: new Date() },
    });

    const res = await requestReturn(signToken(user), returnBody({ order, product }, { quantity: 1 }));

    expect(res.status).toBe(201);
    expect(res.body.returnRequest.quantity).toBe(1);
  });

  it("records the refund at the returned size's own price", async () => {
    const setup = await twoSizeOrder();
    const rr = await ReturnRequest.create({
      order: setup.order._id,
      user: setup.user._id,
      product: setup.product._id,
      productName: setup.product.name,
      quantity: 1,
      size: "King",
      reason: "Wrong size",
      status: "Approved",
    });

    const res = await setReturnStatus(setup.adminToken, rr._id, "Refunded");

    expect(res.status).toBe(200);
    expect((await Order.findById(setup.order._id)).refundedAmount).toBe(1200);
  });

  it("does not guess a size for an old return with none on an order holding several sizes", async () => {
    const setup = await twoSizeOrder();
    const rr = await ReturnRequest.create({
      order: setup.order._id,
      user: setup.user._id,
      product: setup.product._id,
      productName: setup.product.name,
      quantity: 1,
      size: "",
      reason: "Old request",
      status: "Approved",
    });

    const res = await setReturnStatus(setup.adminToken, rr._id, "Refunded");

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/size/i);
    expect((await Order.findById(setup.order._id)).refundedAmount || 0).toBe(0);
    const fresh = await ReturnRequest.findById(rr._id);
    expect(fresh.status).toBe("Approved");
    expect(fresh.stockRestored).toBe(false);
    expect(fresh.pointsClawedBack).toBe(false);
  });

  it("still refunds an old return with no size when the product has only one line", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({
      price: 1200,
      stock: 10,
      variants: [{ size: "King", price: 1200, stock: 10 }],
    });
    const order = await createOrder({
      user,
      products: [product],
      overrides: {
        orderItems: [lineFor(product, "King", 1200, 1)],
        totalPrice: 1200,
        paymentMethod: "COD",
        deliveredAt: new Date(),
      },
    });
    const rr = await ReturnRequest.create({
      order: order._id,
      user: user._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      size: "",
      reason: "Old request",
      status: "Approved",
    });

    const res = await setReturnStatus(signToken(admin), rr._id, "Refunded");

    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).refundedAmount).toBe(1200);
  });
});
