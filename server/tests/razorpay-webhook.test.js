import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

const { rzp, sendEmail } = vi.hoisted(() => ({
  rzp: { fetch: vi.fn(), fetchPayments: vi.fn(), capture: vi.fn(), refund: vi.fn() },
  sendEmail: vi.fn(),
}));

// Razorpay is mocked only to prove the webhook never calls it (no capture,
// no refund); the webhook itself makes no Razorpay API calls.
vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: rzp.fetch, fetchPayments: rzp.fetchPayments, create: vi.fn() };
      this.payments = { capture: rzp.capture, refund: rzp.refund };
    }
  },
}));

vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Notification from "../models/Notification.js";
import { createUser, createProduct, signToken } from "./helpers.js";

const URL = "/api/payments/razorpay/webhook";
const SECRET = "test-webhook-secret";
const ADMIN_EMAIL = "admin-alerts@example.com";

beforeAll(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
});

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  sendEmail.mockReset().mockResolvedValue(undefined);
  Object.values(rzp).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- helpers ----------

const sign = (raw, secret = SECRET) => crypto.createHmac("sha256", secret).update(raw).digest("hex");

const paymentCaptured = ({ razorpayOrderId, paymentId = "pay_ok", amount = 99900, currency = "INR" }) =>
  JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: paymentId, order_id: razorpayOrderId, amount, currency, status: "captured" },
      },
    },
  });

const orderPaid = ({ razorpayOrderId, paymentId = "pay_ok", amount = 99900 }) =>
  JSON.stringify({
    entity: "event",
    event: "order.paid",
    payload: {
      payment: {
        entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: "INR", status: "captured" },
      },
      order: { entity: { id: razorpayOrderId, amount, status: "paid" } },
    },
  });

const otherEvent = (event, razorpayOrderId, status) =>
  JSON.stringify({
    entity: "event",
    event,
    payload: {
      payment: {
        entity: { id: "pay_x", order_id: razorpayOrderId, amount: 99900, currency: "INR", status },
      },
    },
  });

const deliver = (raw, { signature = sign(raw), eventId = "evt_test1" } = {}) => {
  const req = request(app).post(URL).set("Content-Type", "application/json").set("X-Razorpay-Event-Id", eventId);
  if (signature !== null) req.set("X-Razorpay-Signature", signature);
  return req.send(raw);
};

let counter = 0;

const makeOrder = async (overrides = {}) => {
  counter += 1;
  const user = await createUser();
  const product = await createProduct({ stock: 4 });

  const order = await Order.create({
    user: user._id,
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
    razorpayOrderId: `order_wh${counter}`,
    totalPrice: 999,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });

  return { order, user, product };
};

const confirmations = (user) => Notification.countDocuments({ user: user._id, title: "Payment confirmed" });
const adminEmails = () => sendEmail.mock.calls.filter(([arg]) => arg.to === ADMIN_EMAIL);
const stockOf = async (product) => (await Product.findById(product._id)).stock;

// ---------- tests ----------

describe("Razorpay webhook: signature and payload checks", () => {
  it("marks the right order paid on a valid payment.captured", async () => {
    const { order, user } = await makeOrder();
    const other = await makeOrder();

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));

    expect(res.status).toBe(200);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentSource).toBe("webhook");
    expect(reloaded.razorpayPaymentId).toBe("pay_ok");
    expect(reloaded.orderStatus).toBe("Pending");
    await vi.waitFor(async () => expect(await confirmations(user)).toBe(1));
    expect((await Order.findById(other.order._id)).isPaid).toBe(false);
  });

  it("rejects a body whose whitespace changed after signing", async () => {
    const { order } = await makeOrder();
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId });
    const reformatted = JSON.stringify(JSON.parse(raw), null, 2);

    const res = await deliver(reformatted, { signature: sign(raw) });

    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("rejects a missing signature", async () => {
    const { order } = await makeOrder();

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }), { signature: null });

    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("rejects a wrong or malformed signature", async () => {
    const { order } = await makeOrder();
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId });

    expect((await deliver(raw, { signature: sign(raw, "some-other-secret") })).status).toBe(400);
    expect((await deliver(raw, { signature: "not-hex" })).status).toBe(400);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("fails closed with 503 when the webhook secret isn't configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { order } = await makeOrder();

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }), {
      signature: sign("anything"),
    });

    expect(res.status).toBe(503);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("rejects malformed JSON even with a valid signature", async () => {
    const raw = '{"event":"payment.captured", broken';

    const res = await deliver(raw);
    expect(res.status).toBe(400);
  });

  it("never queries or writes for non-string identifiers", async () => {
    const { order } = await makeOrder();
    const findOne = vi.spyOn(Order, "findOne");
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_ok", order_id: { $ne: "" }, amount: 99900, currency: "INR", status: "captured" },
        },
      },
    });

    const res = await deliver(raw);

    expect(res.status).toBe(200);
    expect(findOne).not.toHaveBeenCalled();
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("never logs the body, the signature or the secret", async () => {
    const { order } = await makeOrder();
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId });
    const signature = sign(raw);
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});

    await deliver(raw, { signature });

    const logged = logs.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("[razorpay-webhook]");
    expect(logged).not.toContain(signature);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('"payload"');
  });
});

describe("Razorpay webhook: idempotency and ordering", () => {
  it("handles three deliveries of the same event as one paid transition and one notification", async () => {
    const { order, user } = await makeOrder();
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId });

    for (let i = 0; i < 3; i += 1) {
      expect((await deliver(raw)).status).toBe(200);
    }

    expect((await Order.findById(order._id)).isPaid).toBe(true);
    await vi.waitFor(async () => expect(await confirmations(user)).toBe(1));
  });

  it("processes order.paid followed by payment.captured once", async () => {
    const { order, user } = await makeOrder();

    expect((await deliver(orderPaid({ razorpayOrderId: order.razorpayOrderId }), { eventId: "evt_a" })).status).toBe(200);
    expect((await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }), { eventId: "evt_b" })).status).toBe(200);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentReviewNeeded).toBe(false);
    await vi.waitFor(async () => expect(await confirmations(user)).toBe(1));
  });

  it("webhook and browser verify racing: exactly one paid transition", async () => {
    const { order, user } = await makeOrder();
    const verifySignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpayOrderId}|pay_ok`)
      .digest("hex");

    const [hook, verify] = await Promise.all([
      deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId })),
      request(app)
        .post("/api/orders/verify-payment")
        .set("Authorization", `Bearer ${signToken(user)}`)
        .send({
          orderId: order._id.toString(),
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: "pay_ok",
          razorpay_signature: verifySignature,
        }),
    ]);

    expect(hook.status).toBe(200);
    expect(verify.status).toBe(200);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);
    expect(["webhook", "verify"]).toContain(reloaded.paymentSource);
    expect(reloaded.paymentReviewNeeded).toBe(false);
    // verify never sends the in-app note; the webhook only does on its own transition.
    expect(await confirmations(user)).toBeLessThanOrEqual(1);
  });

  it("flags a different payment id on an already-paid order once", async () => {
    const { order } = await makeOrder();

    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_one" }));
    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_two" }));
    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_two" }));

    const reloaded = await Order.findById(order._id);
    expect(reloaded.razorpayPaymentId).toBe("pay_one");
    expect(reloaded.extraPaymentIds).toEqual(["pay_two"]);
    expect(reloaded.paymentReviewReason).toBe("duplicate_payment");
    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
  });
});

describe("Razorpay webhook: orders that shouldn't simply be marked paid", () => {
  it("returns 200 and writes nothing for an unknown Razorpay order", async () => {
    const { order } = await makeOrder();

    const res = await deliver(paymentCaptured({ razorpayOrderId: "order_doesnotexist" }));

    expect(res.status).toBe(200);
    expect(await Order.countDocuments({ isPaid: true })).toBe(0);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("flags an amount or currency mismatch for review instead of marking paid", async () => {
    const wrongAmount = await makeOrder();
    const wrongCurrency = await makeOrder();

    await deliver(paymentCaptured({ razorpayOrderId: wrongAmount.order.razorpayOrderId, amount: 100 }));
    await deliver(paymentCaptured({ razorpayOrderId: wrongCurrency.order.razorpayOrderId, currency: "USD" }));

    for (const { order } of [wrongAmount, wrongCurrency]) {
      const reloaded = await Order.findById(order._id);
      expect(reloaded.isPaid).toBe(false);
      expect(reloaded.paymentReviewNeeded).toBe(true);
      expect(reloaded.paymentReviewReason).toBe("amount_mismatch");
    }
  });

  it("late capture on a cron-cancelled order: flagged, alerted once, not revived, stock untouched", async () => {
    const { order, user, product } = await makeOrder({
      orderStatus: "Cancelled",
      cancellationReason: "payment_timeout",
      cancelledAt: new Date(),
      cancelledBy: "system",
    });
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId });

    await deliver(raw);
    await deliver(raw);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paidAfterCancellation).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(await stockOf(product)).toBe(4);
    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
    expect(await confirmations(user)).toBe(0);
  });

  it("late capture on an order cancelled before PR #348 (no cancellationReason) is handled the same way", async () => {
    const { order, product } = await makeOrder({ orderStatus: "Cancelled" });

    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(await stockOf(product)).toBe(4);
    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
  });

  it("capture after conversion to COD: flagged, order stays COD and unchanged otherwise", async () => {
    const { order, user } = await makeOrder({
      paymentMethod: "COD",
      convertedToCodAt: new Date(),
      codCharge: 50,
      totalPrice: 1049,
    });

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));

    expect(res.status).toBe(200);
    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentMethod).toBe("COD");
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.totalPrice).toBe(1049);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cod_conversion");
    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
    expect(await confirmations(user)).toBe(0);
  });

  it("payment.authorized and payment.failed only log: no state change, nothing captured or refunded", async () => {
    const { order } = await makeOrder();

    expect((await deliver(otherEvent("payment.authorized", order.razorpayOrderId, "authorized"))).status).toBe(200);
    expect((await deliver(otherEvent("payment.failed", order.razorpayOrderId, "failed"))).status).toBe(200);
    expect((await deliver(otherEvent("refund.created", order.razorpayOrderId, "processed"))).status).toBe(200);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.paymentReviewNeeded).toBe(false);
    expect(rzp.capture).not.toHaveBeenCalled();
    expect(rzp.refund).not.toHaveBeenCalled();
  });
});

describe("Razorpay webhook: review follow-ups (F1, F2) and edge cases", () => {
  it("F1: answers without waiting for a slow admin-alert email, and the alert still goes out once", async () => {
    let release;
    sendEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { order } = await makeOrder({ orderStatus: "Cancelled" });

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));
    expect(res.status).toBe(200);

    // The response came back while the email is still in flight: the alert
    // is claimed but not marked sent.
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    let reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(true);
    expect(reloaded.paymentReviewReason).toBe("paid_after_cancellation");
    expect(reloaded.paymentNotices.reviewAlert.claimedAt).toBeInstanceOf(Date);
    expect(reloaded.paymentNotices.reviewAlert.sentAt).toBeFalsy();

    release();
    await vi.waitFor(async () => {
      reloaded = await Order.findById(order._id);
      expect(reloaded.paymentNotices.reviewAlert.sentAt).toBeInstanceOf(Date);
    });
    expect(adminEmails()).toHaveLength(1);
  });

  it("F1: a failed background alert is logged and left unsent for the cron sweep, with no unhandled rejection", async () => {
    sendEmail.mockRejectedValue(new Error("Brevo down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { order } = await makeOrder({ orderStatus: "Cancelled" });

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));
    expect(res.status).toBe(200);

    await vi.waitFor(async () => {
      const reloaded = await Order.findById(order._id);
      expect(reloaded.paymentNotices?.reviewAlert?.attempts).toBe(1);
      expect(reloaded.paymentNotices.reviewAlert.claimedAt).toBeFalsy();
    });
    const reloaded = await Order.findById(order._id);
    expect(reloaded.paymentNotices.reviewAlert.sentAt).toBeFalsy();
    expect(reloaded.paymentReviewNeeded).toBe(true);
    expect(errors).toHaveBeenCalled();
  });

  it("F2: records the mismatched payment once across concurrent and repeated deliveries, and the alert shows it", async () => {
    const { order, product } = await makeOrder();
    const raw = paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_wrong", amount: 100 });

    await Promise.all([deliver(raw), deliver(raw)]);
    await deliver(raw);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.orderStatus).toBe("Pending");
    expect(reloaded.paymentReviewReason).toBe("amount_mismatch");
    expect(reloaded.mismatchedPayments).toHaveLength(1);
    expect(reloaded.mismatchedPayments[0]).toMatchObject({ paymentId: "pay_wrong", amount: 100, currency: "INR" });
    expect(reloaded.mismatchedPayments[0].receivedAt).toBeInstanceOf(Date);
    expect(await stockOf(product)).toBe(4);

    await vi.waitFor(() => expect(adminEmails()).toHaveLength(1));
    const html = adminEmails()[0][0].html;
    expect(html).toContain("pay_wrong");
    expect(html).toContain("₹1.00");
  });

  it("F2: a second, different mismatched payment is added without overwriting the first; extraPaymentIds untouched", async () => {
    const { order } = await makeOrder();

    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_a", amount: 100 }));
    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, paymentId: "pay_b", currency: "USD" }));

    const reloaded = await Order.findById(order._id);
    expect(reloaded.mismatchedPayments.map((p) => p.paymentId)).toEqual(["pay_a", "pay_b"]);
    expect(reloaded.mismatchedPayments[1].currency).toBe("USD");
    expect(reloaded.extraPaymentIds).toBeUndefined();
    expect(reloaded.isPaid).toBe(false);
  });

  it("F2: a mismatch on a cancelled order keeps it cancelled with stock untouched", async () => {
    const { order, product } = await makeOrder({ orderStatus: "Cancelled", cancellationReason: "admin" });

    await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId, amount: 5 }));

    const reloaded = await Order.findById(order._id);
    expect(reloaded.orderStatus).toBe("Cancelled");
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.paymentReviewReason).toBe("amount_mismatch");
    expect(reloaded.mismatchedPayments).toHaveLength(1);
    expect(await stockOf(product)).toBe(4);
  });

  it("order.paid whose order amount disagrees with the payment amount is not marked paid", async () => {
    const { order } = await makeOrder();
    const raw = JSON.stringify({
      entity: "event",
      event: "order.paid",
      payload: {
        payment: {
          entity: { id: "pay_ok", order_id: order.razorpayOrderId, amount: 99900, currency: "INR", status: "captured" },
        },
        order: { entity: { id: order.razorpayOrderId, amount: 100, status: "paid" } },
      },
    });

    expect((await deliver(raw)).status).toBe(200);

    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.paymentReviewReason).toBe("amount_mismatch");
  });

  it("handles malformed but valid-JSON payloads without crashing or touching the database", async () => {
    const { order } = await makeOrder();
    const findOne = vi.spyOn(Order, "findOne");
    const rid = order.razorpayOrderId;
    const bodies = [
      "{}",
      "null",
      "[]",
      '"just a string"',
      "42",
      JSON.stringify({ event: "payment.captured" }),
      JSON.stringify({ event: "payment.captured", payload: null }),
      JSON.stringify({ event: "payment.captured", payload: { payment: null } }),
      JSON.stringify({ event: "payment.captured", payload: { payment: { entity: null } } }),
      JSON.stringify({ event: "payment.captured", payload: { payment: { entity: [] } } }),
      JSON.stringify({ event: "payment.captured", payload: { payment: { entity: "pay_ok" } } }),
      JSON.stringify({ event: "order.paid", payload: { order: { entity: { id: rid, amount: 99900 } } } }),
      JSON.stringify({ event: ["payment.captured"], payload: { payment: { entity: { id: "pay_ok", order_id: rid, status: "captured" } } } }),
      JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_ok", order_id: rid, status: "authorized" } } } }),
    ];

    for (const raw of bodies) {
      const res = await deliver(raw);
      expect(res.status, raw).toBe(200);
    }

    expect(findOne).not.toHaveBeenCalled();
    const reloaded = await Order.findById(order._id);
    expect(reloaded.isPaid).toBe(false);
    expect(reloaded.paymentReviewNeeded).toBe(false);
  });

  it("returns 500 when the order lookup fails, so Razorpay retries the delivery", async () => {
    const { order } = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Order, "findOne").mockImplementation(() => ({
      select: () => Promise.reject(new Error("database unavailable")),
    }));

    const res = await deliver(paymentCaptured({ razorpayOrderId: order.razorpayOrderId }));

    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("rejects a body over the 100 KB limit with 413", async () => {
    const { order } = await makeOrder();
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_ok", order_id: order.razorpayOrderId, amount: 99900, currency: "INR", status: "captured" } } },
      padding: "x".repeat(110 * 1024),
    });

    const res = await deliver(raw);

    expect(res.status).toBe(413);
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });
});
