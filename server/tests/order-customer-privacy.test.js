import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

const { rzp } = vi.hoisted(() => ({ rzp: { fetch: vi.fn(), fetchPayments: vi.fn() } }));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: rzp.fetch, fetchPayments: rzp.fetchPayments, create: vi.fn() };
    }
  },
}));
vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";
import { INTERNAL_ORDER_FIELDS } from "../controllers/orderController.js";

// Round 31 #5: the customer's own order APIs used to return the whole
// Order document, including admin-only bookkeeping -- the admin's free-
// text payment review note, admin user ids, Razorpay check state, email
// claim leases. Customers get their order without those; an admin with
// the "orders" permission still sees everything.

// Written out here (not imported) so a field silently dropped from the
// controller's list fails this test instead of quietly leaking again.
const INTERNAL = [
  "paymentReviewNeeded",
  "paymentReviewReason",
  "paymentReviewOtherReasons",
  "paymentReviewFlaggedAt",
  "paymentReviewResolvedAt",
  "paymentReviewResolvedBy",
  "paymentReviewNote",
  "extraPaymentIds",
  "mismatchedPayments",
  "paidAfterCancellation",
  "cancelledBy",
  "isSeenByAdmin",
  "paymentSource",
  "nextPaymentCheckAt",
  "paymentCheckFailures",
  "lastPaymentCheckError",
  "paymentNotices",
  "reviewNotices",
  "reviewRequestSent",
];

const ADMIN_STATE = {
  paymentReviewNeeded: true,
  paymentReviewReason: "amount_mismatch",
  paymentReviewOtherReasons: ["duplicate_payment"],
  paymentReviewFlaggedAt: new Date(),
  paymentReviewResolvedAt: new Date(),
  paymentReviewResolvedBy: "665f00000000000000000001",
  paymentReviewNote: "INTERNAL-NOTE customer disputed, refund by hand",
  extraPaymentIds: ["pay_extra_1"],
  mismatchedPayments: [{ paymentId: "pay_bad", amount: 100, currency: "INR", receivedAt: new Date() }],
  paidAfterCancellation: true,
  cancelledBy: "665f00000000000000000002",
  isSeenByAdmin: true,
  paymentSource: "cron",
  nextPaymentCheckAt: new Date(),
  paymentCheckFailures: 2,
  lastPaymentCheckError: "timeout",
  paymentNotices: { reminder1: { claimedAt: new Date(), sentAt: new Date(), attempts: 1 } },
  reviewNotices: { request: { claimedAt: new Date(), sentAt: new Date(), attempts: 1 } },
  reviewRequestSent: true,
};

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201001",
};

let counter = 0;
const makeOrder = async (overrides = {}) => {
  counter += 1;
  const customer = await createUser();
  const product = await createProduct({ stock: 4 });
  const order = await Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, image: product.image, price: 999, quantity: 1 }],
    shippingAddress,
    paymentMethod: "Razorpay",
    razorpayOrderId: `order_priv_${counter}`,
    totalPrice: 999,
    refundedAmount: 0,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });
  return { order, customer, product };
};

const auth = (user) => ({ Authorization: `Bearer ${signToken(user)}` });

const expectNoInternal = (order) => {
  expect(order).toBeTruthy();
  const leaked = INTERNAL.filter((key) => key in order);
  expect(leaked).toEqual([]);
  expect(JSON.stringify(order)).not.toContain("INTERNAL-NOTE");
};

// What the customer's pages still need from the same responses.
const expectCustomerFields = (order) => {
  expect(order._id).toBeTruthy();
  expect(order.orderItems[0]).toMatchObject({ price: 999, quantity: 1 });
  expect(order.orderItems[0].returnInfo).toBeTruthy();
  expect(order.totalPrice).toBe(999);
  expect(order.refundedAmount).toBe(0);
  expect(order.orderStatus).toBeTruthy();
  expect(order.statusHistory[0].status).toBe("Pending");
  expect(order.shippingAddress).toMatchObject({ pincode: "201001" });
};

beforeAll(() => {
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
});

beforeEach(() => {
  rzp.fetch.mockReset();
  rzp.fetchPayments.mockReset();
});

describe("customer order responses carry no admin-only fields", () => {
  it("the controller's list covers every field this test checks", () => {
    expect([...INTERNAL_ORDER_FIELDS].sort()).toEqual([...INTERNAL].sort());
  });

  it("GET /api/orders/:id as the owner", async () => {
    const { order, customer } = await makeOrder(ADMIN_STATE);
    const res = await request(app).get(`/api/orders/${order._id}`).set(auth(customer));
    expect(res.status).toBe(200);
    expectNoInternal(res.body.order);
    expectCustomerFields(res.body.order);
    expect(res.body.deliveryFeedbackInfo).toBeTruthy();
  });

  it("GET /api/orders/myorders", async () => {
    const { customer } = await makeOrder(ADMIN_STATE);
    const res = await request(app).get("/api/orders/myorders").set(auth(customer));
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expectNoInternal(res.body.orders[0]);
    expectCustomerFields(res.body.orders[0]);
  });

  it("POST /api/orders (a new COD order)", async () => {
    await seedSiteSettings({ codCharge: 0 });
    const customer = await createUser();
    const product = await createProduct({ price: 320, stock: 5 });
    const res = await request(app)
      .post("/api/orders")
      .set(auth(customer))
      .send({
        orderItems: [{ product: product._id.toString(), name: product.name, image: product.image, price: product.price, quantity: 1 }],
        shippingAddress,
        paymentMethod: "COD",
      });
    expect(res.status).toBe(201);
    expectNoInternal(res.body.order);
    expect(res.body.order._id).toBeTruthy();
    expect(res.body.order.orderItems[0]).toMatchObject({ quantity: 1 });
  });

  it("POST /api/orders/verify-payment (paid)", async () => {
    const { paymentReviewNeeded, paymentReviewReason, paidAfterCancellation, ...rest } = ADMIN_STATE;
    const setup = await makeOrder(rest);
    rzp.fetch.mockResolvedValue({ id: "order_rzp", amount: 99900, currency: "INR", status: "paid" });
    rzp.fetchPayments.mockResolvedValue({
      items: [{ id: "pay_ok", status: "captured", amount: 99900, currency: "INR" }],
    });
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${setup.order.razorpayOrderId}|pay_ok`)
      .digest("hex");

    const res = await request(app)
      .post("/api/orders/verify-payment")
      .set(auth(setup.customer))
      .send({
        orderId: setup.order._id.toString(),
        razorpay_order_id: setup.order.razorpayOrderId,
        razorpay_payment_id: "pay_ok",
        razorpay_signature: signature,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expectNoInternal(res.body.order);
    // razorpay.js fires the GA4 purchase event from these.
    expect(res.body.order.orderItems[0]).toMatchObject({ price: 999, quantity: 1 });
    expect(res.body.order.totalPrice).toBe(999);
  });

  it("an admin with the orders permission still gets every field on GET /api/orders/:id", async () => {
    const { order } = await makeOrder(ADMIN_STATE);
    const admin = await createUser({ role: "admin" });
    const res = await request(app).get(`/api/orders/${order._id}`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.order.paymentReviewNote).toBe(ADMIN_STATE.paymentReviewNote);
    expect(res.body.order.cancelledBy).toBe(ADMIN_STATE.cancelledBy);
    expect(res.body.order.paymentReviewReason).toBe("amount_mismatch");
  });
});
