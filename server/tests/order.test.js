import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { createUser, signToken, createProduct } from "./helpers.js";

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
