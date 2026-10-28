import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { rzp, sendEmail } = vi.hoisted(() => ({
  rzp: { fetch: vi.fn(), fetchPayments: vi.fn() },
  sendEmail: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: rzp.fetch, fetchPayments: rzp.fetchPayments, create: vi.fn() };
    }
  },
}));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Admin Cancel runs in a MongoDB transaction — replica set needed.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { markOrderPaid } from "../utils/orderPayment.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const ADMIN_EMAIL = "admin-alerts@example.invalid";

beforeAll(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
});

beforeEach(() => {
  rzp.fetch.mockReset().mockResolvedValue({ id: "order_rzp", amount: 99900, status: "attempted" });
  rzp.fetchPayments.mockReset().mockResolvedValue({ items: [{ status: "failed" }] });
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

let counter = 0;

// A ₹999 Razorpay order holding 1 unit of stock, 20 redeemed points and the
// customer's one-time first-order coupon — paid unless told otherwise.
const makeOrder = async ({ isPaid = true, ...overrides } = {}) => {
  counter += 1;
  const customer = await createUser({ loyaltyPoints: 0, firstOrderCouponUsed: true });
  const product = await createProduct({ stock: 4 });
  const order = await Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, image: product.image, price: 999, quantity: 1 }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    paymentMethod: "Razorpay",
    razorpayOrderId: `order_rzp_${counter}`,
    totalPrice: 999,
    orderStatus: "Processing",
    statusHistory: [{ status: "Processing", changedAt: new Date() }],
    pointsRedeemed: 20,
    firstOrderCouponApplied: true,
    ...(isPaid && { isPaid: true, paidAt: new Date(), razorpayPaymentId: `pay_${counter}`, paymentSource: "verify" }),
    ...overrides,
  });
  await LoyaltyTransaction.create({
    user: customer._id,
    type: "redeemed",
    points: -20,
    balanceAfter: 0,
    order: order._id,
    description: `Redeemed on order ${order._id}`,
  });
  return { order, customer, product };
};

let adminToken;
beforeEach(async () => {
  adminToken = signToken(await createUser({ role: "admin" }));
});

const cancel = (order, body = {}, token = adminToken) =>
  request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "Cancelled", ...body });

const stockOf = async (product) => (await Product.findById(product._id)).stock;
const adminEmails = () => sendEmail.mock.calls.map(([arg]) => arg).filter((e) => e.to === ADMIN_EMAIL);

// Everything a cancellation gives back is still out.
const expectNothingReversed = async ({ order, customer, product }) => {
  const after = await Order.findById(order._id);
  expect(after.orderStatus).toBe("Processing");
  expect(after.paymentReviewNeeded).not.toBe(true);
  expect(await stockOf(product)).toBe(4);
  const user = await User.findById(customer._id);
  expect(user.loyaltyPoints).toBe(0);
  expect(user.firstOrderCouponUsed).toBe(true);
};

// Everything came back exactly once.
const expectReversedOnce = async ({ customer, product }) => {
  expect(await stockOf(product)).toBe(5);
  const user = await User.findById(customer._id);
  expect(user.loyaltyPoints).toBe(20);
  expect(user.firstOrderCouponUsed).toBe(false);
};

describe("Admin Cancel on a PAID order", () => {
  it("1. without explicit confirmation: 409 PAID_CANCEL_CONFIRM_REQUIRED, nothing changed", async () => {
    const setup = await makeOrder();

    const res = await cancel(setup.order);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("PAID_CANCEL_CONFIRM_REQUIRED");
    expect(res.body.message).toMatch(/refund/i);
    await expectNothingReversed(setup);
    expect(adminEmails()).toHaveLength(0);
  });

  it("2. with confirmation: cancelled, reversed once, paid_order_cancelled review opened, one admin alert", async () => {
    const setup = await makeOrder();

    const res = await cancel(setup.order, { confirmPaidCancellation: true });

    expect(res.status).toBe(200);
    const after = await Order.findById(setup.order._id);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.isPaid).toBe(true);
    expect(after.cancellationReason).toBe("admin");
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("paid_order_cancelled");
    expect(after.paymentReviewFlaggedAt).toBeInstanceOf(Date);
    await expectReversedOnce(setup);

    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
    expect(adminEmails()[0].subject).toMatch(/refund/i);
    expect((await Order.findById(setup.order._id)).paymentNotices.reviewAlert.sentAt).toBeInstanceOf(Date);
  });

  it("3. a payment landing between the admin's read and the cancel claim: 409 confirm-required, not cancelled", async () => {
    const setup = await makeOrder({ isPaid: false });

    // The request read the order as unpaid; Razorpay's payment is recorded
    // (the same markOrderPaid verify/webhook/cron use) right before the claim.
    const realFindOneAndUpdate = Order.findOneAndUpdate.bind(Order);
    vi.spyOn(Order, "findOneAndUpdate").mockImplementationOnce(async (...args) => {
      await markOrderPaid({
        orderId: setup.order._id,
        razorpayOrderId: setup.order.razorpayOrderId,
        paymentId: "pay_race",
        source: "webhook",
      });
      return realFindOneAndUpdate(...args);
    });

    const res = await cancel(setup.order);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAID_CANCEL_CONFIRM_REQUIRED");
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_race");
    await expectNothingReversed(setup);
  });

  it("5. repeated and concurrent confirmed cancels reverse everything once and alert once", async () => {
    const setup = await makeOrder();

    const [a, b] = await Promise.all([
      cancel(setup.order, { confirmPaidCancellation: true }),
      cancel(setup.order, { confirmPaidCancellation: true }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const again = await cancel(setup.order, { confirmPaidCancellation: true });
    expect(again.status).toBe(400);

    await expectReversedOnce(setup);
    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(adminEmails()).toHaveLength(1);
  });

  it("6a. the review write failing rolls the whole cancellation back", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const realUpdateOne = Order.updateOne.bind(Order);
    vi.spyOn(Order, "updateOne").mockImplementation((filter, ...rest) =>
      filter && "paymentReviewNeeded" in filter
        ? Promise.reject(new Error("review write failed"))
        : realUpdateOne(filter, ...rest),
    );

    const res = await cancel(setup.order, { confirmPaidCancellation: true });

    expect(res.status).toBe(500);
    await expectNothingReversed(setup);
  });

  it("6b. a reversal failing rolls back the cancellation and opens no review", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(LoyaltyTransaction, "create").mockRejectedValueOnce(new Error("crash"));

    const res = await cancel(setup.order, { confirmPaidCancellation: true });

    expect(res.status).toBe(500);
    await expectNothingReversed(setup);
  });

  it("7. a failed admin alert keeps the review; the cron's existing retry sends it once later", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    const res = await cancel(setup.order, { confirmPaidCancellation: true });
    expect(res.status).toBe(200);

    await vi.waitFor(async () => {
      const notice = (await Order.findById(setup.order._id)).paymentNotices?.reviewAlert;
      expect(notice?.attempts).toBe(1);
      expect(notice?.claimedAt ?? null).toBeNull();
    });
    const pending = await Order.findById(setup.order._id);
    expect(pending.paymentReviewNeeded).toBe(true);
    expect(pending.paymentNotices.reviewAlert.sentAt ?? null).toBeNull();

    const cron = () => request(app).get(`/api/orders/cancel-stale-razorpay?secret=${process.env.CRON_SECRET}`);
    expect((await cron()).status).toBe(200);
    expect((await Order.findById(setup.order._id)).paymentNotices.reviewAlert.sentAt).toBeInstanceOf(Date);
    expect((await cron()).status).toBe(200);
    expect(adminEmails()).toHaveLength(2); // the failed attempt + the one retry that went out
  });

  it("8. closing the review needs a note and keeps the audit trail", async () => {
    const setup = await makeOrder();
    await cancel(setup.order, { confirmPaidCancellation: true });

    const noNote = await request(app)
      .put(`/api/orders/${setup.order._id}/payment-review/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: " " });
    expect(noNote.status).toBe(400);

    const ok = await request(app)
      .put(`/api/orders/${setup.order._id}/payment-review/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "Refund issued in Razorpay (rfnd_test)" });
    expect(ok.status).toBe(200);

    const after = await Order.findById(setup.order._id);
    expect(after.paymentReviewNeeded).toBe(false);
    expect(after.paymentReviewReason).toBe("paid_order_cancelled");
    expect(after.paymentReviewNote).toBe("Refund issued in Razorpay (rfnd_test)");
    expect(after.paymentReviewResolvedBy).toBeTruthy();
    expect(after.cancelledBy).toBeTruthy();
    expect(after.cancelledAt).toBeInstanceOf(Date);
  });

  it("9. non-admins and invalid transitions are still refused", async () => {
    const setup = await makeOrder();

    const asCustomer = await cancel(setup.order, { confirmPaidCancellation: true }, signToken(setup.customer));
    expect([401, 403]).toContain(asCustomer.status);

    await cancel(setup.order, { confirmPaidCancellation: true });
    const reopen = await request(app)
      .put(`/api/orders/${setup.order._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Processing" });
    expect(reopen.status).toBe(400);
    expect((await Order.findById(setup.order._id)).orderStatus).toBe("Cancelled");
  });

  it("10. paid-and-cancelled orders stay discoverable: legacy ones as before, new ones with an open review", async () => {
    const legacy = await makeOrder({ orderStatus: "Cancelled", cancellationReason: "admin", cancelledAt: new Date() });
    const fresh = await makeOrder();
    await cancel(fresh.order, { confirmPaidCancellation: true });

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.body.orders || []).map((o) => [o._id, o]));

    expect(byId[String(legacy.order._id)]).toMatchObject({ isPaid: true, orderStatus: "Cancelled" });
    expect(byId[String(fresh.order._id)]).toMatchObject({
      isPaid: true,
      orderStatus: "Cancelled",
      paymentReviewNeeded: true,
      paymentReviewReason: "paid_order_cancelled",
    });
  });
});

describe("Admin Cancel on an UNPAID order (unchanged)", () => {
  it("4. no confirmation needed, reversed once, no review, no admin alert", async () => {
    const setup = await makeOrder({ isPaid: false });

    const res = await cancel(setup.order);

    expect(res.status).toBe(200);
    const after = await Order.findById(setup.order._id);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.isPaid).not.toBe(true);
    expect(after.paymentReviewNeeded).not.toBe(true);
    await expectReversedOnce(setup);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(adminEmails()).toHaveLength(0);
  });
});
