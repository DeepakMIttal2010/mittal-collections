import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { lineReturnTerms } from "../utils/returnTerms.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// OR-02 guards (reviewer follow-up 2026-11-27). These pin behaviour that
// OR-02 keeps, so they pass before and after it; they are not red-first.

const DAY = 24 * 60 * 60 * 1000;

describe("lineReturnTerms: when the saved terms count", () => {
  const product = { isReturnable: true, returnPeriodDays: 10 };

  it("G1 no saved terms (an older order): the current product decides", () => {
    expect(lineReturnTerms({}, product, 7)).toEqual({ isReturnable: true, periodDays: 10 });
    expect(lineReturnTerms({}, { isReturnable: false, returnPeriodDays: 0 }, 7)).toEqual({
      isReturnable: false,
      periodDays: 7,
    });
  });

  it("G2 saved isReturnable false wins even though the product is returnable now", () => {
    expect(lineReturnTerms({ isReturnable: false, returnPeriodDays: 7 }, product, 7)).toEqual({
      isReturnable: false,
      periodDays: 7,
    });
  });

  it("G3 saved days 0, negative, fractional or not a number: not valid saved terms, the product decides", () => {
    for (const returnPeriodDays of [0, -3, 2.5, "abc", null]) {
      expect(lineReturnTerms({ isReturnable: false, returnPeriodDays }, product, 7)).toEqual({
        isReturnable: true,
        periodDays: 10,
      });
    }
  });

  it("G4 only one of the two saved: the product decides both", () => {
    expect(lineReturnTerms({ isReturnable: false }, product, 7)).toEqual({ isReturnable: true, periodDays: 10 });
    expect(lineReturnTerms({ returnPeriodDays: 3 }, product, 7)).toEqual({ isReturnable: true, periodDays: 10 });
  });

  it("G5 no saved terms and no product: counted as returnable with the site default (each caller decides the rest)", () => {
    expect(lineReturnTerms({}, null, 7)).toEqual({ isReturnable: true, periodDays: 7 });
  });
});

describe("T10b an older order whose product was deleted", () => {
  beforeEach(async () => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({});
    await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
  });

  const setup = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    // As an order placed before OR-02: no return terms on the line.
    const order = await Order.create({
      user: user._id,
      orderItems: [{ product: product._id, name: product.name, price: 500, quantity: 1, size: "" }],
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
      deliveredAt: new Date(Date.now() - 2 * DAY),
    });
    expect(order.orderItems[0].isReturnable).toBeUndefined();
    await Product.deleteOne({ _id: product._id });
    return { user, product, order };
  };

  it("T10b-1 the return request is refused", async () => {
    const { user, product, order } = await setup();
    const res = await request(app)
      .post("/api/returns")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ orderId: String(order._id), productId: String(product._id), quantity: 1, reason: "Wrong size" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This product is not eligible for return");
  });

  it("T10b-2 My Orders agrees with T10b-1: not eligible, contact us instead (OR-09)", async () => {
    // Until OR-09 this recorded the mismatch (eligible true while the
    // return request was refused).
    const { user, order } = await setup();
    const res = await request(app).get("/api/orders/myorders").set("Authorization", `Bearer ${signToken(user)}`);
    expect(res.status).toBe(200);
    const line = res.body.orders.find((o) => o._id === String(order._id)).orderItems[0];
    expect(line.returnInfo.isReturnable).toBe(true);
    expect(line.returnInfo.eligible).toBe(false);
    expect(line.returnInfo.contactToReturn).toBe(true);
  });
});
