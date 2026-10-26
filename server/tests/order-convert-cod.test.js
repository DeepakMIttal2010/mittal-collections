import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { fetchOrder, fetchPayments } = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  fetchPayments: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: fetchOrder, fetchPayments };
    }
  },
}));

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { createUser, signToken, createProduct, createOrder, seedSiteSettings } from "./helpers.js";

const cancelledRazorpayOrder = async (product, overrides = {}) =>
  createOrder({
    user: await createUser(),
    products: [product],
    overrides: {
      orderStatus: "Cancelled",
      paymentMethod: "Razorpay",
      razorpayOrderId: "order_conv123",
      isPaid: false,
      ...overrides,
    },
  });

const convert = async (order, body = {}) => {
  const admin = await createUser({ role: "admin" });

  return request(app)
    .put(`/api/orders/${order._id}/convert-to-cod`)
    .set("Authorization", `Bearer ${signToken(admin)}`)
    .send(body);
};

describe("PUT /api/orders/:id/convert-to-cod", () => {
  beforeEach(() => {
    fetchOrder.mockReset().mockResolvedValue({ status: "attempted" });
    fetchPayments.mockReset().mockResolvedValue({ items: [{ status: "failed" }] });
  });

  it("revives a cancelled unpaid Razorpay order as COD, re-reserving its stock", async () => {
    const product = await createProduct({ stock: 5 });
    const order = await cancelledRazorpayOrder(product);

    const res = await convert(order);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentMethod).toBe("COD");
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.convertedToCodAt).toBeInstanceOf(Date);
    expect(reloaded.totalPrice).toBe(order.totalPrice);
    expect(reloaded.codCharge).toBe(0);
    expect(reloaded.statusHistory.at(-1).status).toBe("Pending");
    expect((await Product.findById(product._id)).stock).toBe(4);
  });

  it("adds the COD charge to the total only when asked", async () => {
    await seedSiteSettings({ codCharge: 50 });
    const product = await createProduct();
    const order = await cancelledRazorpayOrder(product);

    const res = await convert(order, { addCodCharge: true });

    expect(res.status).toBe(200);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.codCharge).toBe(50);
    expect(reloaded.totalPrice).toBe(order.totalPrice + 50);
  });

  it("refuses when Razorpay shows the payment actually went through", async () => {
    fetchOrder.mockResolvedValue({ status: "paid" });
    const product = await createProduct({ stock: 5 });
    const order = await cancelledRazorpayOrder(product);

    const res = await convert(order);

    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).paymentMethod).toBe("Razorpay");
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it("refuses when Razorpay can't be reached", async () => {
    fetchOrder.mockRejectedValue(new Error("network"));
    const product = await createProduct({ stock: 5 });
    const order = await cancelledRazorpayOrder(product);

    const res = await convert(order);

    expect(res.status).toBe(502);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });

  it("refuses when the item is out of stock and leaves the order cancelled", async () => {
    const product = await createProduct({ stock: 0 });
    const order = await cancelledRazorpayOrder(product);

    const res = await convert(order);

    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
    expect((await Product.findById(product._id)).stock).toBe(0);
  });

  it("refuses orders that aren't cancelled unpaid Razorpay orders", async () => {
    const product = await createProduct({ stock: 5 });
    const pending = await cancelledRazorpayOrder(product, { orderStatus: "Pending" });
    const paid = await cancelledRazorpayOrder(product, { isPaid: true });
    const cod = await cancelledRazorpayOrder(product, { paymentMethod: "COD" });
    const withPoints = await cancelledRazorpayOrder(product, { pointsRedeemed: 100 });

    for (const order of [pending, paid, cod, withPoints]) {
      const res = await convert(order);
      expect(res.status).toBe(400);
    }

    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it("is admin-only", async () => {
    const product = await createProduct();
    const order = await cancelledRazorpayOrder(product);
    const customer = await createUser();

    const res = await request(app)
      .put(`/api/orders/${order._id}/convert-to-cod`)
      .set("Authorization", `Bearer ${signToken(customer)}`);

    expect(res.status).toBe(403);
  });
});
