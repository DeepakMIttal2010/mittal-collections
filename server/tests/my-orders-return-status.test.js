import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// My Orders -> Cancel/Return audit 2026-11-27, OR-01 + OR-04.
// The return eligibility the customer's order pages read (GET /orders/myorders
// and GET /orders/:id) ignored the returns already filed, so after a reload
// an item with an open or fully refunded return offered "Return this item"
// again (and the request then failed), and the return form offered the full
// line quantity. Each line's returnInfo now also says what is happening:
//   openReturn   { status, quantity } of a Requested/Approved/Picked Up return, or null
//   refundedQty  quantity already refunded
//   remainingQty line quantity minus open and refunded returns
//   eligible     also needs no open return and remainingQty > 0
// Rejected returns use up nothing (a new request is allowed, as before).

const setup = async ({ lines = [{ quantity: 1 }], deliveredDaysAgo = 1 } = {}) => {
  await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
  const customer = await createUser();
  const product = await createProduct({ price: 500, stock: 10, isReturnable: true });
  const order = await Order.create({
    user: customer._id,
    orderItems: lines.map((line) => ({
      product: product._id,
      name: product.name,
      image: product.image,
      price: 500,
      quantity: line.quantity,
      size: line.size || "",
    })),
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    totalPrice: 500 * lines.reduce((sum, l) => sum + l.quantity, 0),
    orderStatus: "Delivered",
    deliveredAt: new Date(Date.now() - deliveredDaysAgo * 24 * 60 * 60 * 1000),
  });
  return { customer, token: signToken(customer), product, order };
};

const addReturn = (s, { status, quantity = 1, size = "", order = s.order } = {}) =>
  ReturnRequest.create({
    order: order._id,
    user: s.customer._id,
    product: s.product._id,
    productName: s.product.name,
    quantity,
    size,
    reason: "Didn't like it",
    status,
  });

const myOrderLines = async (s, orderId = s.order._id) => {
  const res = await request(app).get("/api/orders/myorders").set("Authorization", `Bearer ${s.token}`);
  expect(res.status).toBe(200);
  return res.body.orders.find((o) => o._id === String(orderId)).orderItems;
};

describe("OR-01/OR-04: each order line says which returns are already filed", () => {
  it("S1 an open (Requested) return: not eligible, openReturn shows it", async () => {
    const s = await setup();
    await addReturn(s, { status: "Requested" });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(false);
    expect(line.returnInfo.openReturn).toEqual({ status: "Requested", quantity: 1 });
    expect(line.returnInfo.remainingQty).toBe(0);
  });

  it("S1b Approved and Picked Up count as open too", async () => {
    for (const status of ["Approved", "Picked Up"]) {
      const s = await setup({ lines: [{ quantity: 2 }] });
      await addReturn(s, { status, quantity: 1 });
      const [line] = await myOrderLines(s);
      expect(line.returnInfo.openReturn?.status).toBe(status);
      expect(line.returnInfo.eligible).toBe(false);
      expect(line.returnInfo.remainingQty).toBe(1);
    }
  });

  it("S2 the whole line refunded: not eligible, nothing remaining", async () => {
    const s = await setup({ lines: [{ quantity: 2 }] });
    await addReturn(s, { status: "Refunded", quantity: 2 });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(false);
    expect(line.returnInfo.openReturn).toBeNull();
    expect(line.returnInfo.refundedQty).toBe(2);
    expect(line.returnInfo.remainingQty).toBe(0);
  });

  it("S3 part of the line refunded: still eligible for the rest", async () => {
    const s = await setup({ lines: [{ quantity: 2 }] });
    await addReturn(s, { status: "Refunded", quantity: 1 });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(true);
    expect(line.returnInfo.openReturn).toBeNull();
    expect(line.returnInfo.refundedQty).toBe(1);
    expect(line.returnInfo.remainingQty).toBe(1);
  });

  it("S4 guard: a rejected return uses up nothing", async () => {
    const s = await setup({ lines: [{ quantity: 2 }] });
    await addReturn(s, { status: "Rejected", quantity: 2 });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(true);
    expect(line.returnInfo.openReturn ?? null).toBeNull();
    expect(line.returnInfo.remainingQty ?? 2).toBe(2);
  });

  it("S5 the same product in two sizes: a return of one size leaves the other alone", async () => {
    const s = await setup({ lines: [{ quantity: 1, size: "90x100" }, { quantity: 1, size: "90x108" }] });
    await addReturn(s, { status: "Requested", size: "90x100" });
    const lines = await myOrderLines(s);
    const small = lines.find((l) => l.size === "90x100");
    const large = lines.find((l) => l.size === "90x108");
    expect(small.returnInfo.eligible).toBe(false);
    expect(small.returnInfo.openReturn?.status).toBe("Requested");
    expect(large.returnInfo.eligible).toBe(true);
    expect(large.returnInfo.remainingQty ?? 1).toBe(1);
  });

  it("S6 guard: a return on another order of the same product does not count here", async () => {
    const s = await setup();
    const other = await Order.create({ ...s.order.toObject(), _id: undefined, createdAt: undefined, updatedAt: undefined });
    await addReturn(s, { status: "Refunded", order: other });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(true);
    expect(line.returnInfo.remainingQty ?? 1).toBe(1);
  });

  it("S7 the single-order endpoint (order details) carries the same fields", async () => {
    const s = await setup({ lines: [{ quantity: 2 }] });
    await addReturn(s, { status: "Refunded", quantity: 1 });
    const res = await request(app).get(`/api/orders/${s.order._id}`).set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(200);
    const [line] = res.body.order.orderItems;
    expect(line.returnInfo.refundedQty).toBe(1);
    expect(line.returnInfo.remainingQty).toBe(1);
    expect(line.returnInfo.eligible).toBe(true);
  });

  it("S8 guard: the return window still decides first", async () => {
    const s = await setup({ deliveredDaysAgo: 10 });
    const [line] = await myOrderLines(s);
    expect(line.returnInfo.eligible).toBe(false);
  });
});
