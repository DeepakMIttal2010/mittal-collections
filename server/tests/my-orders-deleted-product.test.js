import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// My Orders -> Cancel/Return audit 2026-11-27, OR-09.
// When a product had been deleted, My Orders still offered "Return this
// item" (it counted a missing product as returnable) while the return
// request refused it ("This product is not eligible for return"). Now the
// line is not eligible, and, while its return window is still open,
// returnInfo.contactToReturn tells the page to send the customer to us
// instead (a return can't be filed online without the product).

const DAY = 24 * 60 * 60 * 1000;

const setup = async ({ deliveredDaysAgo = 2, savedTerms = true } = {}) => {
  await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
  const customer = await createUser();
  const product = await createProduct({ price: 500, stock: 5 });
  const order = await Order.create({
    user: customer._id,
    orderItems: [
      {
        product: product._id,
        name: product.name,
        price: 500,
        quantity: 1,
        size: "",
        ...(savedTerms ? { isReturnable: true, returnPeriodDays: 7 } : {}),
      },
    ],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201012",
    },
    totalPrice: 500,
    orderStatus: "Delivered",
    deliveredAt: new Date(Date.now() - deliveredDaysAgo * DAY),
  });
  return { customer, product, order };
};

const myLine = async (s) => {
  const res = await request(app).get("/api/orders/myorders").set("Authorization", `Bearer ${signToken(s.customer)}`);
  expect(res.status).toBe(200);
  return res.body.orders.find((o) => o._id === String(s.order._id)).orderItems[0];
};

describe("OR-09: a deleted product's line is not offered for an online return", () => {
  it("D1 deleted product, window open (order with saved terms): not eligible, contact us instead", async () => {
    const s = await setup();
    await Product.deleteOne({ _id: s.product._id });
    const line = await myLine(s);
    const { returnInfo } = line;
    expect(returnInfo.eligible).toBe(false);
    expect(returnInfo.contactToReturn).toBe(true);
    // Not called non-returnable: it was sold as returnable.
    expect(returnInfo.isReturnable).toBe(true);
    // The line keeps its product id (populate turns a missing product into null).
    expect(line.product).toBe(String(s.product._id));
  });

  it("D2 the same for an older order without saved terms", async () => {
    const s = await setup({ savedTerms: false });
    await Product.deleteOne({ _id: s.product._id });
    const { returnInfo } = await myLine(s);
    expect(returnInfo.eligible).toBe(false);
    expect(returnInfo.contactToReturn).toBe(true);
  });

  it("D3 GET /orders/:id says the same", async () => {
    const s = await setup();
    await Product.deleteOne({ _id: s.product._id });
    const res = await request(app).get(`/api/orders/${s.order._id}`).set("Authorization", `Bearer ${signToken(s.customer)}`);
    expect(res.status).toBe(200);
    expect(res.body.order.orderItems[0].returnInfo).toMatchObject({ eligible: false, contactToReturn: true });
  });

  it("D4 guard: window already closed -> no contact prompt; the closing date is still given", async () => {
    const s = await setup({ deliveredDaysAgo: 10 });
    await Product.deleteOne({ _id: s.product._id });
    const { returnInfo } = await myLine(s);
    expect(returnInfo.eligible).toBe(false);
    expect(returnInfo.contactToReturn).toBe(false);
    expect(returnInfo.deadline).toBeTruthy();
  });

  it("D5 guard: a return already open -> no contact prompt (the status line covers it)", async () => {
    const s = await setup();
    await ReturnRequest.create({
      order: s.order._id,
      user: s.customer._id,
      product: s.product._id,
      productName: s.product.name,
      quantity: 1,
      reason: "Wrong size",
      status: "Approved",
    });
    await Product.deleteOne({ _id: s.product._id });
    const { returnInfo } = await myLine(s);
    expect(returnInfo.contactToReturn).toBe(false);
    expect(returnInfo.openReturn).toEqual({ status: "Approved", quantity: 1 });
  });

  it("D6 guard: product still there -> eligible as before, no contact prompt", async () => {
    const s = await setup();
    const { returnInfo } = await myLine(s);
    expect(returnInfo.eligible).toBe(true);
    expect(returnInfo.contactToReturn).toBe(false);
  });
});
