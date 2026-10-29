import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

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

import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import * as orderController from "../controllers/orderController.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const ADMIN_EMAIL = "admin-alerts@example.invalid";
const WEBHOOK_SECRET = "test-webhook-secret";

beforeAll(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
});

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  rzp.fetch.mockReset();
  rzp.fetchPayments.mockReset();
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

let counter = 0;

// An unpaid ₹999 Razorpay order (Razorpay order amount 99900 paise).
const makeOrder = async (overrides = {}) => {
  counter += 1;
  const customer = await createUser();
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
    razorpayOrderId: `order_vc_${counter}`,
    totalPrice: 999,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });
  return { order, customer, product };
};

// What Razorpay reports for the order and its payments.
const razorpaySays = ({ status = "paid", payments = [], amount = 99900 } = {}) => {
  rzp.fetch.mockResolvedValue({ id: "order_rzp", amount, currency: "INR", status });
  rzp.fetchPayments.mockResolvedValue({ items: payments });
};
const payment = (status, overrides = {}) => ({
  id: "pay_signed",
  status,
  amount: 99900,
  currency: "INR",
  ...overrides,
});

const signature = (razorpayOrderId, paymentId, secret = process.env.RAZORPAY_KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");

// What Checkout / Pay Now send after Razorpay's success handler fires.
const verify = ({ order, customer }, { paymentId = "pay_signed", sig } = {}) =>
  request(app)
    .post("/api/orders/verify-payment")
    .set("Authorization", `Bearer ${signToken(customer)}`)
    .send({
      orderId: order._id.toString(),
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sig ?? signature(order.razorpayOrderId, paymentId),
    });

// A not-yet-confirmed payment: told to wait, never to pay again, never
// handed a checkout to reopen.
const expectPending = (res) => {
  expect(res.status).toBe(202);
  expect(res.body.success).toBe(false);
  expect(res.body.pending).toBe(true);
  expect(res.body.code).toBe("PAYMENT_CONFIRMATION_PENDING");
  expect(res.body.message).toMatch(/don't pay again/i);
  expect(res.body.razorpayOrder).toBeUndefined();
};

describe("POST /api/orders/verify-payment — a valid signature alone doesn't mark an order paid", () => {
  it("1. authorized-only payment: pending, NOT paid, stock still reserved", async () => {
    const setup = await makeOrder();
    razorpaySays({ status: "attempted", payments: [payment("authorized")] });

    const res = await verify(setup);

    expectPending(res);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(false);
    expect(after.orderStatus).toBe("Pending");
  });

  it("2. captured with the wrong AMOUNT: NOT paid, amount_mismatch review, one admin alert", async () => {
    const setup = await makeOrder();
    razorpaySays({ payments: [payment("captured", { amount: 50000 })] });

    const res = await verify(setup);

    expectPending(res);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("amount_mismatch");
    expect(sendEmail.mock.calls.filter(([e]) => e.to === ADMIN_EMAIL)).toHaveLength(1);
  });

  it("3. captured in the wrong CURRENCY: NOT paid, review flagged", async () => {
    const setup = await makeOrder();
    razorpaySays({ payments: [payment("captured", { currency: "USD" })] });

    const res = await verify(setup);

    expectPending(res);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewReason).toBe("amount_mismatch");
  });

  it("4. captured with matching amount and currency: paid, as before", async () => {
    const setup = await makeOrder();
    razorpaySays({ payments: [payment("captured")] });

    const res = await verify(setup);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Payment verified successfully");
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_signed");
    expect(after.paymentSource).toBe("verify");
  });

  it("5. invalid signature: 400, Razorpay never asked, nothing written", async () => {
    const setup = await makeOrder();
    razorpaySays({ payments: [payment("captured")] });

    const res = await verify(setup, { sig: signature(setup.order.razorpayOrderId, "pay_signed", "wrong-secret") });

    expect(res.status).toBe(400);
    expect(rzp.fetch).not.toHaveBeenCalled();
    expect(rzp.fetchPayments).not.toHaveBeenCalled();
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("6. Razorpay can't be reached: pending (no failure, no checkout), NOT paid", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    rzp.fetch.mockRejectedValue(new Error("Razorpay unavailable"));
    rzp.fetchPayments.mockRejectedValue(new Error("Razorpay unavailable"));

    const res = await verify(setup);

    expectPending(res);
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("7. Razorpay says 'paid' but lists no captured payment: pending, NOT paid", async () => {
    const setup = await makeOrder();
    razorpaySays({ status: "paid", payments: [] });

    const res = await verify(setup);

    expectPending(res);
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("8a. captured payment on an order the cron already cancelled: recorded + paid_after_cancellation, not revived", async () => {
    const setup = await makeOrder({ orderStatus: "Cancelled", cancellationReason: "payment_timeout", cancelledAt: new Date() });
    razorpaySays({ payments: [payment("captured")] });

    const res = await verify(setup);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already cancelled/);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.paymentReviewReason).toBe("paid_after_cancellation");
  });

  it("8b. captured payment on an order switched to COD: recorded + paid_after_cod_conversion", async () => {
    const setup = await makeOrder({ paymentMethod: "COD", convertedToCodAt: new Date(), totalPrice: 1049 });
    razorpaySays({ payments: [payment("captured")] });

    const res = await verify(setup);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Cash on Delivery/);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewReason).toBe("paid_after_cod_conversion");
  });

  it("9. webhook payment.captured after a pending verify settles the order exactly once", async () => {
    const setup = await makeOrder();
    razorpaySays({ status: "attempted", payments: [payment("authorized")] });
    expectPending(await verify(setup));

    const raw = JSON.stringify({
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_signed", order_id: setup.order.razorpayOrderId, amount: 99900, currency: "INR", status: "captured" },
        },
      },
    });
    const deliver = () =>
      request(app)
        .post("/api/payments/razorpay/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Event-Id", "evt_capture_1")
        .set("X-Razorpay-Signature", crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"))
        .send(raw);

    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200); // Razorpay redelivery

    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_signed");
    expect(after.paymentSource).toBe("webhook");
    expect(after.extraPaymentIds || []).toHaveLength(0);

    // The customer's page retrying verify now just sees it paid.
    razorpaySays({ payments: [payment("captured")] });
    const again = await verify(setup);
    expect(again.status).toBe(200);
    expect(again.body.success).toBe(true);
    expect((await Order.findById(setup.order._id)).paymentSource).toBe("webhook");
  });
});

describe("verify-payment: one bounded recheck after an AUTHORIZED verdict", () => {
  // The real pause is 2.5s; tests shorten it (a no-op on code without it).
  beforeEach(() => orderController.__setCaptureRecheckDelayForTests?.(20));
  afterEach(() => orderController.__setCaptureRecheckDelayForTests?.());

  const authorizedThen = (second) => {
    rzp.fetch.mockResolvedValue({ id: "order_rzp", amount: 99900, currency: "INR", status: "attempted" });
    rzp.fetchPayments.mockResolvedValueOnce({ items: [payment("authorized")] });
    if (second instanceof Error) rzp.fetchPayments.mockRejectedValueOnce(second);
    else rzp.fetchPayments.mockResolvedValueOnce({ items: second });
  };

  it("R1. authorized, then captured on the recheck: paid exactly once with the captured id", async () => {
    const setup = await makeOrder();
    authorizedThen([payment("captured")]);

    const res = await verify(setup);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(rzp.fetchPayments).toHaveBeenCalledTimes(2);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_signed");
    expect(after.extraPaymentIds || []).toHaveLength(0);
  });

  it("R2. still authorized on the recheck: 202 pending, unpaid, exactly one recheck", async () => {
    const setup = await makeOrder();
    authorizedThen([payment("authorized")]);

    const res = await verify(setup);

    expectPending(res);
    expect(rzp.fetchPayments).toHaveBeenCalledTimes(2);
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("R3. a mismatch on the recheck: review flagged, unpaid", async () => {
    const setup = await makeOrder();
    authorizedThen([payment("captured", { amount: 50000 })]);

    const res = await verify(setup);

    expectPending(res);
    expect(rzp.fetchPayments).toHaveBeenCalledTimes(2);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewReason).toBe("amount_mismatch");
  });

  it("R4a. Razorpay failing on the recheck: pending, unpaid", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    authorizedThen(new Error("Razorpay unavailable"));

    const res = await verify(setup);

    expectPending(res);
    expect(rzp.fetchPayments).toHaveBeenCalledTimes(2);
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("R4b. an inconclusive recheck (no payments listed on a 'paid' order): pending, unpaid", async () => {
    const setup = await makeOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    rzp.fetch
      .mockResolvedValueOnce({ id: "order_rzp", amount: 99900, currency: "INR", status: "attempted" })
      .mockResolvedValueOnce({ id: "order_rzp", amount: 99900, currency: "INR", status: "paid" });
    rzp.fetchPayments.mockResolvedValueOnce({ items: [payment("authorized")] }).mockResolvedValueOnce({ items: [] });

    const res = await verify(setup);

    expectPending(res);
    expect(rzp.fetchPayments).toHaveBeenCalledTimes(2);
    expect((await Order.findById(setup.order._id)).isPaid).toBe(false);
  });

  it("R5. any first verdict other than AUTHORIZED gets no recheck", async () => {
    const cases = [
      { status: "attempted", items: [payment("failed")] }, // UNPAID
      { status: "attempted", items: [payment("created", { created_at: Math.floor(Date.now() / 1000) })] }, // IN_FLIGHT
      { status: "paid", items: [] }, // INCONCLUSIVE
      { status: "paid", items: [payment("captured", { amount: 1 })] }, // MISMATCH
      { status: "paid", items: [payment("captured")] }, // PAID
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (const { status, items } of cases) {
      const setup = await makeOrder();
      rzp.fetchPayments.mockReset();
      razorpaySays({ status, payments: items });
      await verify(setup);
      expect(rzp.fetchPayments).toHaveBeenCalledTimes(1);
    }
  });

  it("R6. the webhook landing during the recheck pause: paid exactly once, no duplicate", async () => {
    orderController.__setCaptureRecheckDelayForTests?.(300);
    const setup = await makeOrder();
    authorizedThen([payment("captured")]);

    const raw = JSON.stringify({
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_signed", order_id: setup.order.razorpayOrderId, amount: 99900, currency: "INR", status: "captured" },
        },
      },
    });
    const webhook = new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
      request(app)
        .post("/api/payments/razorpay/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Event-Id", "evt_capture_r6")
        .set("X-Razorpay-Signature", crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"))
        .send(raw),
    );

    const [res, hook] = await Promise.all([verify(setup), webhook]);

    expect(hook.status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const after = await Order.findById(setup.order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_signed");
    expect(after.extraPaymentIds || []).toHaveLength(0);
    expect(after.paymentReviewNeeded).not.toBe(true);
  });
});
