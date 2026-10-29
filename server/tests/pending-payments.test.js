import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

const { rzp, sendEmail } = vi.hoisted(() => ({
  rzp: { fetch: vi.fn(), fetchPayments: vi.fn(), capture: vi.fn() },
  sendEmail: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: rzp.fetch, fetchPayments: rzp.fetchPayments, create: vi.fn() };
      this.payments = { capture: rzp.capture };
    }
  },
}));

vi.mock("../config/mailer.js", () => ({ sendEmail }));

import mongoose from "mongoose";
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { getPendingPaymentConfig } from "../config/pendingPayment.js";
import { formatIst } from "../utils/orderPayment.js";
import {
  transactionsSupported,
  __resetTransactionSupportForTests,
} from "../utils/orderTransactions.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const ADMIN_EMAIL = "admin-alerts@example.com";
const MINUTE = 60 * 1000;
const ENV_KEYS = [
  "PAYMENT_REMINDER_1_MINUTES",
  "PAYMENT_REMINDER_2_MINUTES",
  "PAYMENT_AUTO_CANCEL_MINUTES",
  "PAYMENT_REMINDERS_ENABLED",
  "PAYMENT_CHECK_MAX_FAILURES",
  "PAYMENT_IN_FLIGHT_GRACE_MINUTES",
];

beforeAll(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
});

beforeEach(() => {
  rzp.fetch.mockReset();
  rzp.fetchPayments.mockReset();
  rzp.capture.mockReset();
  sendEmail.mockReset().mockResolvedValue(undefined);
  razorpaySays({ status: "attempted", payments: [{ status: "failed" }] });
});

afterEach(() => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
  vi.restoreAllMocks();
});

// ---------- helpers ----------

const razorpaySays = ({ status = "attempted", payments = [], amount = 99900 } = {}) => {
  rzp.fetch.mockResolvedValue({ id: "order_rzp", amount, status });
  rzp.fetchPayments.mockResolvedValue({ items: payments });
};

const captured = (id = "pay_ok", amount = 99900) => ({ id, status: "captured", amount, currency: "INR" });

let rzpCounter = 0;

// A Razorpay order created `ageMinutes` ago, with its 1 unit of stock
// already reserved (product stock 4 of 5) the way createOrder leaves it.
const makeOrder = async ({ ageMinutes, user, product, ...overrides } = {}) => {
  rzpCounter += 1;
  const customer = user || (await createUser());
  const item = product || (await createProduct({ stock: 4 }));

  const order = await Order.create({
    user: customer._id,
    orderItems: [{ product: item._id, name: item.name, image: item.image, price: 999, quantity: 1 }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    paymentMethod: "Razorpay",
    razorpayOrderId: `order_rzp_${rzpCounter}`,
    totalPrice: 999,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });

  if (ageMinutes !== undefined) {
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: new Date(Date.now() - ageMinutes * MINUTE) } },
    );
  }

  // A real checkout deducts redeemed points with a ledger entry, and a
  // cancellation refunds exactly what that entry took.
  if (overrides.pointsRedeemed > 0) {
    await LoyaltyTransaction.create({
      user: customer._id,
      type: "redeemed",
      points: -overrides.pointsRedeemed,
      balanceAfter: customer.loyaltyPoints || 0,
      order: order._id,
      description: `Redeemed on order ${order._id}`,
    });
  }

  return { order, user: customer, product: item };
};

const runCron = (path = "cancel-stale-razorpay") =>
  request(app).get(`/api/orders/${path}?secret=${process.env.CRON_SECRET}`);

// Lets the next run look at an order again straight away, as if its
// backoff had elapsed.
const makeDueNow = (orderId) =>
  Order.updateOne({ _id: orderId }, { $set: { nextPaymentCheckAt: null } });

const emailsTo = (to) => sendEmail.mock.calls.map(([arg]) => arg).filter((e) => e.to === to);
const subjectsTo = (to) => emailsTo(to).map((e) => e.subject);

const signature = (razorpayOrderId, paymentId) =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest("hex");

const verify = (user, order, paymentId = "pay_ok") =>
  request(app)
    .post("/api/orders/verify-payment")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send({
      orderId: order._id,
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature(order.razorpayOrderId, paymentId),
    });

const adminToken = async () => signToken(await createUser({ role: "admin" }));

const stockOf = async (product) => (await Product.findById(product._id)).stock;

// ---------- tests ----------

describe("pending-payment config", () => {
  it("uses the approved defaults: 30 min, 3 h, 6 h", () => {
    const cfg = getPendingPaymentConfig();
    expect(cfg.reminder1Minutes).toBe(30);
    expect(cfg.reminder2Minutes).toBe(180);
    expect(cfg.autoCancelMinutes).toBe(360);
    expect(cfg.remindersEnabled).toBe(true);
  });

  it("falls back to the default reminders when reminder 2 isn't after reminder 1", () => {
    process.env.PAYMENT_REMINDER_1_MINUTES = "200";
    process.env.PAYMENT_REMINDER_2_MINUTES = "100";
    vi.spyOn(console, "error").mockImplementation(() => {});

    const cfg = getPendingPaymentConfig();
    expect(cfg.reminder1Minutes).toBe(30);
    expect(cfg.reminder2Minutes).toBe(180);
  });

  it("formats the expiry time in IST", () => {
    // 18:45 UTC = 00:15 IST the next day.
    const text = formatIst(new Date("2026-10-26T18:45:00Z"));
    expect(text).toMatch(/27 Oct 2026/);
    expect(text).toMatch(/12:15/);
    expect(text).toMatch(/IST$/);
  });
});

describe("reminders", () => {
  it("sends reminder #1 from 30 minutes, not before, and only once", async () => {
    const early = await makeOrder({ ageMinutes: 29.5 });
    const due = await makeOrder({ ageMinutes: 30.5 });

    const res = await runCron();
    expect(res.status).toBe(200);
    expect(res.body.reminded1).toBe(1);

    expect(emailsTo(early.user.email)).toHaveLength(0);
    expect(subjectsTo(due.user.email)).toEqual(["Your Mittal Collections order is awaiting payment"]);
    const html = emailsTo(due.user.email)[0].html;
    expect(html).toContain(`/my-orders/${due.order._id}`);
    expect(html).not.toMatch(/order_rzp|pay_/);

    await makeDueNow(due.order._id);
    await runCron();
    expect(emailsTo(due.user.email)).toHaveLength(1);
    expect((await Order.findById(due.order._id)).paymentNotices.reminder1.sentAt).toBeInstanceOf(Date);
  });

  it("sends reminder #2 at 3 hours with the IST cancellation time, and skips a missed reminder #1", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 200 });

    const res = await runCron();
    expect(res.body.reminded2).toBe(1);
    expect(res.body.reminded1).toBe(0);

    const [email] = emailsTo(user.email);
    expect(email.subject).toBe("Final reminder: your order is still awaiting payment");

    const createdAt = (await Order.findById(order._id)).createdAt;
    expect(email.html).toContain(formatIst(new Date(createdAt.getTime() + 360 * MINUTE)));
  });

  it("doesn't send duplicates when two cron runs overlap", async () => {
    const { user } = await makeOrder({ ageMinutes: 31 });

    await Promise.all([runCron(), runCron(), runCron()]);

    expect(emailsTo(user.email)).toHaveLength(1);
  });

  it("can be switched off with PAYMENT_REMINDERS_ENABLED=false", async () => {
    process.env.PAYMENT_REMINDERS_ENABLED = "false";
    const { user } = await makeOrder({ ageMinutes: 31 });

    await runCron();
    expect(emailsTo(user.email)).toHaveLength(0);
  });

  it("retries a failed reminder on later runs, at most 3 attempts", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 31 });
    sendEmail.mockRejectedValue(new Error("Brevo down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (let run = 0; run < 5; run += 1) {
      await runCron();
      await makeDueNow(order._id);
    }

    expect(emailsTo(user.email)).toHaveLength(3);
    const notice = (await Order.findById(order._id)).paymentNotices.reminder1;
    expect(notice.sentAt).toBeFalsy();
    expect(notice.attempts).toBe(3);
  });
});

describe("auto-cancellation", () => {
  it("cancels at 6 hours and gives back stock, points and the first-order coupon exactly once", async () => {
    const user = await createUser({ loyaltyPoints: 0, firstOrderCouponUsed: true });
    const { order, product } = await makeOrder({
      ageMinutes: 361,
      user,
      pointsRedeemed: 50,
      firstOrderCouponApplied: true,
    });

    const res = await runCron();
    expect(res.body.cancelled).toBe(1);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.cancellationReason).toBe("payment_timeout");
    expect(reloaded.cancelledBy).toBe("system");
    expect(await stockOf(product)).toBe(5);

    const reloadedUser = await User.findById(user._id);
    expect(reloadedUser.loyaltyPoints).toBe(50);
    expect(reloadedUser.firstOrderCouponUsed).toBe(false);

    expect(subjectsTo(user.email)).toEqual(["Your order has been cancelled — payment not received"]);

    // Later runs don't release anything a second time.
    await makeDueNow(order._id);
    await runCron();
    await runCron();
    expect(await stockOf(product)).toBe(5);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(50);
    expect(await LoyaltyTransaction.countDocuments({ order: order._id, type: "refunded" })).toBe(1);
    expect(emailsTo(user.email)).toHaveLength(1);
  });

  it("doesn't cancel before the deadline", async () => {
    const { order } = await makeOrder({ ageMinutes: 359 });

    await runCron();
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
  });

  it("after downtime, cancels an overdue order directly without stacking reminders", async () => {
    const { user } = await makeOrder({ ageMinutes: 7 * 60 });

    await runCron();
    expect(subjectsTo(user.email)).toEqual(["Your order has been cancelled — payment not received"]);
  });

  it("honours PAYMENT_AUTO_CANCEL_MINUTES (45 restores the old window)", async () => {
    process.env.PAYMENT_AUTO_CANCEL_MINUTES = "45";
    const { order } = await makeOrder({ ageMinutes: 50 });

    await runCron();
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });

  it("never touches COD orders", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 7 * 60, paymentMethod: "COD", razorpayOrderId: "" });

    await runCron();
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
    expect(emailsTo(user.email)).toHaveLength(0);
    expect(rzp.fetch).not.toHaveBeenCalled();
  });

  it("rolls everything back if the cancellation fails part-way, then completes it once on the next run", async () => {
    const user = await createUser({ loyaltyPoints: 0 });
    const { order, product } = await makeOrder({ ageMinutes: 361, user, pointsRedeemed: 50 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Fails after the stock and the points balance were already written
    // inside the transaction.
    vi.spyOn(LoyaltyTransaction, "create").mockRejectedValueOnce(new Error("crash"));

    const first = await runCron();
    expect(first.body.errors).toBe(1);
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
    expect(await stockOf(product)).toBe(4);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(0);

    await makeDueNow(order._id);
    const second = await runCron();
    expect(second.body.cancelled).toBe(1);
    expect(await stockOf(product)).toBe(5);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(50);
  });

  it("retries the cancellation email if it failed after the cancel committed", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 361 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    await runCron();
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");

    const retry = await runCron();
    expect(retry.body.noticesRetried).toBe(1);

    // One failed attempt + one delivered.
    expect(emailsTo(user.email)).toHaveLength(2);
    expect((await Order.findById(order._id)).paymentNotices.timeoutCancel.sentAt).toBeInstanceOf(Date);
  });
});

describe("Razorpay payment states", () => {
  it("records a captured payment instead of reminding or cancelling", async () => {
    razorpaySays({ status: "paid", payments: [captured("pay_cap")] });
    const { order, user } = await makeOrder({ ageMinutes: 361 });

    const res = await runCron();
    expect(res.body.recovered).toBe(1);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentSource).toBe("cron");
    expect(reloaded.orderStatus).toBe("Pending");
    expect(emailsTo(user.email)).toHaveLength(0);
  });

  it("never cancels, reminds or captures while a payment is authorized", async () => {
    razorpaySays({ payments: [{ id: "pay_auth", status: "authorized", amount: 99900, currency: "INR" }] });
    const early = await makeOrder({ ageMinutes: 31 });

    await runCron();
    expect(emailsTo(early.user.email)).toHaveLength(0);
    expect((await Order.findById(early.order._id)).paymentReviewNeeded).toBe(false);
    expect(rzp.capture).not.toHaveBeenCalled();
  });

  it("puts an authorized payment past the deadline up for review with one admin alert, stock still reserved", async () => {
    razorpaySays({ payments: [{ id: "pay_auth", status: "authorized", amount: 99900, currency: "INR" }] });
    const { order, product } = await makeOrder({ ageMinutes: 361 });

    await runCron();
    await makeDueNow(order._id);
    await runCron();

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.paymentReviewNeeded).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("authorized_uncaptured");
    expect(await stockOf(product)).toBe(4);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
    expect(rzp.capture).not.toHaveBeenCalled();
  });

  it("returns a review to the normal schedule once the authorization clears", async () => {
    razorpaySays({ payments: [{ id: "pay_auth", status: "authorized", amount: 99900, currency: "INR" }] });
    const { order } = await makeOrder({ ageMinutes: 361 });
    await runCron();

    razorpaySays({ payments: [{ id: "pay_auth", status: "failed" }] });
    await makeDueNow(order._id);
    await runCron();

    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentReviewNeeded).toBe(false);
    expect(reloaded.paymentReviewResolvedBy).toBe("system");
    expect(reloaded.orderStatus).toBe("Cancelled");
  });

  it("skips an order whose payment attempt is still in flight, but not a stale attempt", async () => {
    const recent = Math.floor(Date.now() / 1000) - 60;
    const stale = Math.floor(Date.now() / 1000) - 45 * 60;

    razorpaySays({ payments: [{ status: "created", created_at: recent }] });
    const inFlight = await makeOrder({ ageMinutes: 361 });
    const res = await runCron();
    expect(res.body.skippedInFlight).toBe(1);
    expect((await Order.findById(inFlight.order._id)).orderStatus).toBe("Pending");

    razorpaySays({ payments: [{ status: "created", created_at: stale }] });
    await makeDueNow(inFlight.order._id);
    await runCron();
    expect((await Order.findById(inFlight.order._id)).orderStatus).toBe("Cancelled");
  });

  it("never cancels on an inconclusive check, and asks for review after repeated failures", async () => {
    process.env.PAYMENT_CHECK_MAX_FAILURES = "3";
    vi.spyOn(console, "error").mockImplementation(() => {});
    rzp.fetch.mockRejectedValue(new Error("ETIMEDOUT"));
    const { order, product } = await makeOrder({ ageMinutes: 361 });

    for (let run = 0; run < 4; run += 1) {
      const res = await runCron();
      expect(res.body.cancelled).toBe(0);
      await makeDueNow(order._id);
    }

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.paymentReviewNeeded).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("check_inconclusive");
    expect(await stockOf(product)).toBe(4);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);

    // A malformed response is just as inconclusive.
    rzp.fetch.mockResolvedValue(undefined);
    await runCron();
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
  });

  it("flags a captured payment whose amount doesn't match", async () => {
    razorpaySays({ status: "paid", payments: [captured("pay_bad", 100)] });
    const { order } = await makeOrder({ ageMinutes: 31 });

    await runCron();

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.paymentReviewReason).toBe("amount_mismatch");
  });
});

describe("late payments and races", () => {
  it("verify after the cron cancelled: recorded, flagged, one admin alert, not revived", async () => {
    const { order, user, product } = await makeOrder({ ageMinutes: 361 });
    await runCron();

    // The payment shows up captured in Razorpay only after the cancel.
    razorpaySays({ status: "paid", payments: [captured()] });
    const res = await verify(user, order);
    expect(res.status).toBe(200);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paidAfterCancellation).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(await stockOf(product)).toBe(5);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);

    // Re-verifying is a no-op.
    await verify(user, order);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });

  it("verify before the cron: the cron then leaves the paid order alone", async () => {
    const { order, user, product } = await makeOrder({ ageMinutes: 361 });
    razorpaySays({ status: "paid", payments: [captured()] });
    await verify(user, order);
    await runCron();

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.paidAfterCancellation).toBe(false);
    expect(await stockOf(product)).toBe(4);
  });

  it("verify and the cron racing: one consistent outcome, stock released at most once", async () => {
    const { order, user, product } = await makeOrder({ ageMinutes: 361 });
    // The capture lands in between: whichever asks Razorpay first still
    // sees no payment, the other sees it captured.
    rzp.fetch
      .mockResolvedValueOnce({ id: "order_rzp", amount: 99900, status: "attempted" })
      .mockResolvedValue({ id: "order_rzp", amount: 99900, status: "paid" });
    rzp.fetchPayments
      .mockResolvedValueOnce({ items: [{ status: "failed" }] })
      .mockResolvedValue({ items: [captured()] });

    await Promise.all([verify(user, order), runCron()]);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);

    if (reloaded.orderStatus === "Cancelled") {
      expect(reloaded.paidAfterCancellation).toBe(true);
      expect(await stockOf(product)).toBe(5);
      expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
    } else {
      expect(reloaded.paidAfterCancellation).toBe(false);
      expect(await stockOf(product)).toBe(4);
    }
  });

  it("finds a late capture on a cancelled order through the post-cancel recheck", async () => {
    const { order, product } = await makeOrder({ ageMinutes: 361 });
    await runCron();

    razorpaySays({ status: "paid", payments: [captured("pay_late")] });
    await makeDueNow(order._id);
    const res = await runCron();
    expect(res.body.latePayments).toBe(1);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(await stockOf(product)).toBe(5);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });

  it("records a second payment on an already-paid order as a possible double charge, once", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 10 });
    razorpaySays({ status: "paid", payments: [captured("pay_one")] });
    await verify(user, order, "pay_one");
    await verify(user, order, "pay_two");
    await verify(user, order, "pay_two");

    const reloaded = await Order.findById(order._id);
    expect(reloaded.razorpayPaymentId).toBe("pay_one");
    expect(reloaded.extraPaymentIds).toEqual(["pay_two"]);
    expect(reloaded.paymentReviewReason).toBe("duplicate_payment");
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });
});

describe("convert-to-COD with late payments", () => {
  const cancelledOrder = async () => {
    const { order, user, product } = await makeOrder({ ageMinutes: 361 });
    await runCron();
    sendEmail.mockClear();
    return { order: await Order.findById(order._id), user, product };
  };

  const convert = async (order) =>
    request(app)
      .put(`/api/orders/${order._id}/convert-to-cod`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .send({});

  it("payment arriving through verify after conversion: flagged, one alert, not changed back", async () => {
    const { order, user } = await cancelledOrder();
    expect((await convert(order)).status).toBe(200);

    razorpaySays({ status: "paid", payments: [captured()] });
    const res = await verify(user, order);
    expect(res.body.message).toMatch(/switched to Cash on Delivery/);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentMethod).toBe("COD");
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentReviewNeeded).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cod_conversion");
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });

  it("payment arriving after conversion is also found by the recheck", async () => {
    const { order } = await cancelledOrder();
    await convert(order);

    razorpaySays({ status: "paid", payments: [captured("pay_late")] });
    const res = await runCron();
    expect(res.body.latePayments).toBe(1);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cod_conversion");
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });

  it("is refused while a payment attempt is still in flight", async () => {
    const { order } = await cancelledOrder();
    razorpaySays({ payments: [{ status: "created", created_at: Math.floor(Date.now() / 1000) - 60 }] });

    const res = await convert(order);
    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });

  it("leaves stock untouched if it fails between reserving and claiming", async () => {
    const { order, product } = await cancelledOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const original = Order.findOneAndUpdate.bind(Order);
    vi.spyOn(Order, "findOneAndUpdate").mockImplementation((filter, ...rest) => {
      if (filter?.orderStatus === "Cancelled" && filter?.paymentMethod === "Razorpay") {
        throw new Error("crash");
      }
      return original(filter, ...rest);
    });

    const res = await convert(order);
    expect(res.status).toBe(500);
    expect(await stockOf(product)).toBe(5);
    expect((await Order.findById(order._id)).orderStatus).toBe("Cancelled");
  });

  it("two concurrent conversions: one wins, stock reserved once", async () => {
    const { order, product } = await cancelledOrder();

    const results = await Promise.all([convert(order), convert(order)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(await stockOf(product)).toBe(4);
  });
});

describe("admin side", () => {
  it("admin Cancel runs in a transaction and records who cancelled", async () => {
    const user = await createUser({ loyaltyPoints: 0 });
    const { order, product } = await makeOrder({ user, pointsRedeemed: 20 });
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ status: "Cancelled" });

    expect(res.status).toBe(200);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.cancellationReason).toBe("admin");
    expect(reloaded.cancelledBy).toBe(String(admin._id));
    expect(await stockOf(product)).toBe(5);
    expect((await User.findById(user._id)).loyaltyPoints).toBe(20);
  });

  it("closes a payment review only with a note", async () => {
    const { order } = await makeOrder({
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
    });
    const token = await adminToken();

    const empty = await request(app)
      .put(`/api/orders/${order._id}/payment-review/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "  " });
    expect(empty.status).toBe(400);

    const ok = await request(app)
      .put(`/api/orders/${order._id}/payment-review/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "Authorization lapsed in Razorpay" });
    expect(ok.status).toBe(200);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentReviewNeeded).toBe(false);
    expect(reloaded.paymentReviewNote).toBe("Authorization lapsed in Razorpay");
  });

  it("keeps the old cron URL and response keys, and serves the new alias", async () => {
    await makeOrder({ ageMinutes: 361 });

    const old = await runCron("cancel-stale-razorpay");
    expect(old.status).toBe(200);
    expect(old.body).toEqual(
      expect.objectContaining({ success: true, cancelled: 1, recovered: 0, message: expect.any(String) }),
    );

    const alias = await runCron("process-pending-payments");
    expect(alias.status).toBe(200);
    expect(alias.body.success).toBe(true);

    const noSecret = await request(app).get("/api/orders/process-pending-payments");
    expect(noSecret.status).toBe(401);
  });
});

describe("pre-merge fixes", () => {
  // Pretends the database is a standalone server (no transactions) for
  // one test; the real answer is re-detected afterwards.
  const pretendNoTransactions = () => {
    __resetTransactionSupportForTests();
    vi.spyOn(mongoose.connection.db, "admin").mockReturnValue({
      command: async () => ({}),
    });
  };

  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.ALLOW_NON_TRANSACTIONAL_ORDER_WRITES;
    process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
    vi.restoreAllMocks();
    __resetTransactionSupportForTests();
  });

  it("G1: a failed transaction-support check is not cached; the next call retries", async () => {
    __resetTransactionSupportForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mongoose.connection.db, "admin").mockImplementationOnce(() => ({
      command: () => Promise.reject(new Error("network blip")),
    }));

    expect(await transactionsSupported()).toBe(false);
    expect(await transactionsSupported()).toBe(true);
  });

  it("G2: without transactions outside tests, admin Cancel returns 503 and changes nothing", async () => {
    const user = await createUser({ loyaltyPoints: 0, firstOrderCouponUsed: true });
    const { order, product } = await makeOrder({ user, pointsRedeemed: 20, firstOrderCouponApplied: true });
    const token = await adminToken();
    pretendNoTransactions();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.NODE_ENV = "production";

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Cancelled" });

    expect(res.status).toBe(503);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.statusHistory).toHaveLength(1);
    expect(await stockOf(product)).toBe(4);
    const reloadedUser = await User.findById(user._id);
    expect(reloadedUser.loyaltyPoints).toBe(0);
    expect(reloadedUser.firstOrderCouponUsed).toBe(true);
  });

  it("G2: without transactions outside tests, convert-to-COD returns 503 and changes nothing", async () => {
    const { order, product } = await makeOrder({
      orderStatus: "Cancelled",
      product: await createProduct({ stock: 5 }),
    });
    const token = await adminToken();
    pretendNoTransactions();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.NODE_ENV = "production";

    const res = await request(app)
      .put(`/api/orders/${order._id}/convert-to-cod`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(503);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.paymentMethod).toBe("Razorpay");
    expect(await stockOf(product)).toBe(5);
  });

  it("G2: non-cancel status changes do not need a transaction", async () => {
    const { order } = await makeOrder({});
    const token = await adminToken();
    pretendNoTransactions();
    process.env.NODE_ENV = "production";

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Processing" });

    expect(res.status).toBe(200);
  });

  it("G2: the non-transactional fallback still works in tests and when explicitly allowed", async () => {
    const first = await makeOrder({});
    const second = await makeOrder({});
    const token = await adminToken();
    pretendNoTransactions();

    const inTests = await request(app)
      .put(`/api/orders/${first.order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Cancelled" });
    expect(inTests.status).toBe(200);
    expect(await stockOf(first.product)).toBe(5);

    process.env.NODE_ENV = "production";
    process.env.ALLOW_NON_TRANSACTIONAL_ORDER_WRITES = "true";
    const allowed = await request(app)
      .put(`/api/orders/${second.order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Cancelled" });
    expect(allowed.status).toBe(200);
  });

  it("G2: the cron never auto-cancels without transactions", async () => {
    const { order, product } = await makeOrder({ ageMinutes: 361 });
    pretendNoTransactions();

    const res = await runCron();
    expect(res.body.cancelSkippedNoTransactions).toBe(1);
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
    expect(await stockOf(product)).toBe(4);
  });

  it("G3: a reminder held by a crashed run's lease is retried after the lease, not dropped", async () => {
    const { order, user } = await makeOrder({ ageMinutes: 31 });
    // A previous run claimed reminder #1 two minutes ago and died before sending.
    await Order.updateOne(
      { _id: order._id },
      { $set: { "paymentNotices.reminder1": { claimedAt: new Date(Date.now() - 2 * MINUTE), attempts: 1 } } },
    );

    await runCron();
    expect(emailsTo(user.email)).toHaveLength(0);

    const next = (await Order.findById(order._id)).nextPaymentCheckAt.getTime();
    expect(next).toBeGreaterThan(Date.now() + 9 * MINUTE);
    expect(next).toBeLessThan(Date.now() + 12 * MINUTE);

    // The lease runs out and the order comes due again.
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "paymentNotices.reminder1.claimedAt": new Date(Date.now() - 11 * MINUTE),
          nextPaymentCheckAt: null,
        },
      },
    );
    await runCron();

    expect(subjectsTo(user.email)).toEqual(["Your Mittal Collections order is awaiting payment"]);
    expect((await Order.findById(order._id)).paymentNotices.reminder1.attempts).toBe(2);
  });

  it("G4: late payment on an admin-cancelled Razorpay order is flagged, not revived, stock untouched", async () => {
    const { order, product } = await makeOrder({ ageMinutes: 10 });

    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .send({ status: "Cancelled" });
    expect(await stockOf(product)).toBe(5);

    razorpaySays({ status: "paid", payments: [captured("pay_late_admin")] });
    const res = await runCron();
    expect(res.body.latePayments).toBe(1);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(await stockOf(product)).toBe(5);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });

  it("G5: without ADMIN_NOTIFICATION_EMAIL the alert is not marked sent and goes out once it is set", async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const configErrors = vi.spyOn(console, "error").mockImplementation(() => {});
    razorpaySays({ status: "paid", payments: [captured("pay_bad", 100)] });
    const { order } = await makeOrder({ ageMinutes: 31 });

    for (let run = 0; run < 4; run += 1) await runCron();

    let reloaded = await Order.findById(order._id);
    expect(reloaded.paymentReviewNeeded).toBe(true);
    expect(reloaded.paymentNotices?.reviewAlert?.sentAt).toBeFalsy();
    expect(reloaded.paymentNotices?.reviewAlert?.attempts || 0).toBe(0);
    expect(
      configErrors.mock.calls.some(([msg]) => String(msg).includes("ADMIN_NOTIFICATION_EMAIL is not set")),
    ).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();

    process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
    await runCron();
    await runCron();

    reloaded = await Order.findById(order._id);
    expect(reloaded.paymentNotices.reviewAlert.sentAt).toBeInstanceOf(Date);
    expect(emailsTo(ADMIN_EMAIL)).toHaveLength(1);
  });
});
