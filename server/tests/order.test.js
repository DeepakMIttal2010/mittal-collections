import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const orderItem = (product, overrides = {}) => ({
  product: product._id.toString(),
  name: product.name,
  image: product.image,
  price: product.price,
  quantity: 1,
  ...overrides,
});

describe("POST /api/orders", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/api/orders").send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects an order with no items", async () => {
    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderItems: [], shippingAddress, paymentMethod: "COD" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("places an order, decrements stock, and computes the correct total", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 999, stock: 10 });
    // Not testing the COD charge here — zero it out.
    await seedSiteSettings({ codCharge: 0 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [orderItem(product, { quantity: 2 })],
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // subtotal 1998 >= the 499 free-shipping default threshold, so
    // delivery fee is 0 and totalPrice should equal the subtotal exactly.
    expect(res.body.order.totalPrice).toBe(1998);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(8);

    const savedOrder = await Order.findById(res.body.order._id);
    expect(savedOrder.orderStatus).toBe("Pending");
    expect(savedOrder.user.toString()).toBe(user._id.toString());
  });

  it("adds the COD charge to a Cash on Delivery order's total but not a Razorpay order's", async () => {
    const user = await createUser();
    const token = signToken(user);
    const product = await createProduct({ price: 1000, stock: 10 });

    const codRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [orderItem(product, { quantity: 1 })],
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(codRes.status).toBe(201);
    // 1000 subtotal (clears free-shipping threshold, so no delivery fee)
    // + the default ₹50 COD charge.
    expect(codRes.body.order.totalPrice).toBe(1050);
    expect(codRes.body.order.codCharge).toBe(50);

    // Razorpay order creation itself can't succeed in this environment
    // (no real Razorpay test credentials, so Razorpay's API call always
    // errors) — but the local Order is created and its totalPrice/
    // codCharge already computed *before* that Razorpay step runs, so
    // checking the DB directly still verifies the COD charge is correctly
    // skipped for a non-COD order.
    await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [orderItem(product, { quantity: 1 })],
        shippingAddress,
        paymentMethod: "Razorpay",
      });

    const razorpayOrder = await Order.findOne({
      user: user._id,
      paymentMethod: "Razorpay",
    });
    expect(razorpayOrder.totalPrice).toBe(1000);
    expect(razorpayOrder.codCharge).toBe(0);
  });

  it("rejects the whole order and rolls back stock when one item is short", async () => {
    const user = await createUser();
    const token = signToken(user);

    const okProduct = await createProduct({ name: "In Stock Item", stock: 10 });
    const shortProduct = await createProduct({
      name: "Short Item",
      stock: 1,
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [
          orderItem(okProduct, { quantity: 2 }),
          orderItem(shortProduct, { quantity: 5 }),
        ],
        shippingAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Short Item");

    // The first item's stock reservation must have been rolled back —
    // this is the guarantee that an order is never partially created
    // against insufficient stock.
    const reloadedOk = await Product.findById(okProduct._id);
    const reloadedShort = await Product.findById(shortProduct._id);
    expect(reloadedOk.stock).toBe(10);
    expect(reloadedShort.stock).toBe(1);

    const orderCount = await Order.countDocuments();
    expect(orderCount).toBe(0);
  });
});

const createTestOrder = async (overrides = {}) => {
  const user = overrides.user || (await createUser())._id;
  const product = overrides.product || (await createProduct());

  return Order.create({
    user,
    orderItems: [orderItem(product)],
    shippingAddress,
    totalPrice: product.price,
    orderStatus: "Pending",
    ...overrides,
  });
};

describe("Admin order delete / restore", () => {
  it("refuses to delete an order that isn't Cancelled", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const order = await createTestOrder({ orderStatus: "Pending" });

    const res = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isActive).toBe(true);
  });

  it("soft-deletes a Cancelled order and restores it", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const order = await createTestOrder({ orderStatus: "Cancelled" });

    const deleteRes = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect((await Order.findById(order._id)).isActive).toBe(false);

    const restoreRes = await request(app)
      .put(`/api/orders/${order._id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);
    expect((await Order.findById(order._id)).isActive).toBe(true);
  });

  it("refuses to permanently delete an order that hasn't been soft-deleted first", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const order = await createTestOrder({ orderStatus: "Cancelled" });

    const res = await request(app)
      .delete(`/api/orders/${order._id}/permanent`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(await Order.findById(order._id)).not.toBeNull();
  });

  it("refuses to permanently delete an order with a linked return request", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct();
    const order = await createTestOrder({ orderStatus: "Cancelled", product });
    order.isActive = false;
    await order.save();

    await ReturnRequest.create({
      order: order._id,
      user: order.user,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Damaged on arrival",
    });

    const res = await request(app)
      .delete(`/api/orders/${order._id}/permanent`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(await Order.findById(order._id)).not.toBeNull();
  });

  it("permanently deletes a soft-deleted, Cancelled order with no linked records", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const order = await createTestOrder({ orderStatus: "Cancelled" });
    order.isActive = false;
    await order.save();

    const res = await request(app)
      .delete(`/api/orders/${order._id}/permanent`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await Order.findById(order._id)).toBeNull();
  });

  it("refuses to change status on a soft-deleted order", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const order = await createTestOrder({ orderStatus: "Cancelled" });
    order.isActive = false;
    await order.save();

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Processing" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });

  it("rejects a non-admin user's attempt to delete an order", async () => {
    const customer = await createUser();
    const token = signToken(customer);
    const order = await createTestOrder({ orderStatus: "Cancelled" });

    const res = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect((await Order.findById(order._id)).isActive).toBe(true);
  });
});
