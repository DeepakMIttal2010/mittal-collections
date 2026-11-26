import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// D3 (owner decisions D3-1..D3-5): an online (Razorpay) order whose payment
// has not been captured (isPaid !== true) must not move into fulfilment --
// Processing, Shipped or Delivered -- through any request. The one exception
// is Shipped -> Delivered (the parcel has already left; that records
// reality). COD orders are untouched by this rule. There is no override.

vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

// Cancel (test 8) runs in a transaction -- replica set needed.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import PincodeLookup from "../models/PincodeLookup.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const PIN = "201001"; // Ghaziabad, UP -- deliverable; cached so no India Post call

let adminToken;
beforeEach(async () => {
  adminToken = signToken(await createUser({ role: "admin" }));
  await PincodeLookup.updateOne(
    { pincode: PIN },
    { $set: { state: "Uttar Pradesh", district: "Ghaziabad", verifiedAt: new Date() } },
    { upsert: true },
  );
});

let counter = 0;
const makeOrder = async ({ paymentMethod = "Razorpay", isPaid = false, status = "Pending", ...overrides } = {}) => {
  counter += 1;
  const customer = await createUser();
  const product = await createProduct({ stock: 5 });
  const history = ["Pending", "Processing", "Shipped", "Delivered"];
  return Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, image: product.image, price: 999, quantity: 1 }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: PIN,
    },
    paymentMethod,
    ...(paymentMethod === "Razorpay" && { razorpayOrderId: `order_d3_${counter}` }),
    ...(isPaid && { isPaid: true, paidAt: new Date(), razorpayPaymentId: `pay_d3_${counter}`, paymentSource: "verify" }),
    totalPrice: 999,
    orderStatus: status,
    statusHistory: history.slice(0, history.indexOf(status) + 1).map((s) => ({ status: s, changedAt: new Date() })),
    ...overrides,
  });
};

const setStatus = (order, status) =>
  request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

const expectBlocked = async (res, order, unchangedStatus) => {
  expect(res.status).toBe(400);
  expect(res.body.success).toBe(false);
  expect(res.body.code).toBe("PAYMENT_NOT_RECEIVED");
  expect(res.body.message).toMatch(/payment/i);
  const after = await Order.findById(order._id).lean();
  expect(after.orderStatus).toBe(unchangedStatus);
  expect(after.statusHistory.at(-1).status).toBe(unchangedStatus);
};

describe("D3: unpaid online orders cannot move into fulfilment", () => {
  it("1. unpaid Razorpay Pending -> Processing is blocked (D3-1)", async () => {
    const order = await makeOrder();
    await expectBlocked(await setStatus(order, "Processing"), order, "Pending");
  });

  it("2. unpaid Razorpay -> Shipped is blocked (from Pending and from Processing)", async () => {
    const pending = await makeOrder();
    await expectBlocked(await setStatus(pending, "Shipped"), pending, "Pending");

    // An unpaid order already in Processing (from before this rule).
    const processing = await makeOrder({ status: "Processing" });
    await expectBlocked(await setStatus(processing, "Shipped"), processing, "Processing");
  });

  it("3. unpaid Razorpay -> Delivered is blocked (skipping ahead)", async () => {
    const order = await makeOrder();
    await expectBlocked(await setStatus(order, "Delivered"), order, "Pending");
  });

  it("4. payment authorized but not captured is blocked too (D3-2)", async () => {
    const order = await makeOrder({
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
      paymentReviewFlaggedAt: new Date(),
    });
    await expectBlocked(await setStatus(order, "Processing"), order, "Pending");
    await expectBlocked(await setStatus(order, "Shipped"), order, "Pending");
  });

  it("5. guard: a paid Razorpay order goes Processing -> Shipped -> Delivered as before", async () => {
    const order = await makeOrder({ isPaid: true });
    for (const status of ["Processing", "Shipped", "Delivered"]) {
      const res = await setStatus(order, status);
      expect(res.status, status).toBe(200);
      expect((await Order.findById(order._id)).orderStatus).toBe(status);
    }
  });

  it("6. guard: a COD order (paid on delivery) is not affected", async () => {
    const order = await makeOrder({ paymentMethod: "COD" });
    for (const status of ["Processing", "Shipped", "Delivered"]) {
      const res = await setStatus(order, status);
      expect(res.status, status).toBe(200);
    }
  });

  it("7. guard: an unpaid Razorpay order already Shipped can still be marked Delivered (D3-4)", async () => {
    const order = await makeOrder({ status: "Shipped" });
    const res = await setStatus(order, "Delivered");
    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("Delivered");
  });

  it("8. guard: an unpaid Razorpay order can still be cancelled", async () => {
    const order = await makeOrder();
    const res = await setStatus(order, "Cancelled");
    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });
});
