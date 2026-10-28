import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { fetchOrder, fetchPayments, sendEmail } = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  fetchPayments: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { fetch: fetchOrder, fetchPayments };
    }
  },
}));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Notification from "../models/Notification.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";

const RZP_ORDER_ID = "order_resume123";

// An unpaid ₹500 Razorpay order, as checkout leaves it before payment.
const unpaidOrder = async (overrides = {}) => {
  const customer = await createUser();
  const order = await createOrder({
    user: customer,
    products: [await createProduct({ price: 500 })],
    overrides: {
      orderStatus: "Pending",
      paymentMethod: "Razorpay",
      razorpayOrderId: RZP_ORDER_ID,
      isPaid: false,
      ...overrides,
    },
  });
  return { order, token: signToken(customer) };
};

const resume = (order, token) =>
  request(app).post(`/api/orders/${order._id}/resume-payment`).set("Authorization", `Bearer ${token}`);

const razorpayOrder = (status) => ({ id: RZP_ORDER_ID, status, amount: 50000, currency: "INR" });
const payments = (...items) => ({ items });

beforeEach(() => {
  fetchOrder.mockReset();
  fetchPayments.mockReset();
  sendEmail.mockReset().mockResolvedValue(undefined);
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin-alerts@example.invalid";
  process.env.RAZORPAY_KEY_ID = "test-key-id";
});

describe("POST /api/orders/:id/resume-payment — Razorpay's view decides", () => {
  it("1. an AUTHORIZED earlier payment: 409, no new checkout, nothing written", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("attempted"));
    fetchPayments.mockResolvedValue(
      payments({ id: "pay_auth1", status: "authorized", amount: 50000, currency: "INR" }),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/confirm/i);
    expect(res.body.razorpayOrder).toBeUndefined();

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewNeeded).not.toBe(true);
  });

  it("2a. a captured payment with the wrong AMOUNT: not marked paid, amount_mismatch review, one alert, no checkout", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("paid"));
    fetchPayments.mockResolvedValue(
      payments({ id: "pay_short1", status: "captured", amount: 40000, currency: "INR" }),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.razorpayOrder).toBeUndefined();

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("amount_mismatch");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("admin-alerts@example.invalid");
  });

  it("2b. a captured payment in the wrong CURRENCY: same — not paid, amount_mismatch review", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("paid"));
    fetchPayments.mockResolvedValue(
      payments({ id: "pay_usd1", status: "captured", amount: 50000, currency: "USD" }),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(409);
    expect(res.body.razorpayOrder).toBeUndefined();
    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(false);
    expect(after.paymentReviewReason).toBe("amount_mismatch");
  });

  it("3. a captured payment for the right amount: self-heals to paid, as before", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("paid"));
    fetchPayments.mockResolvedValue(
      payments(
        { id: "pay_fail0", status: "failed", amount: 50000, currency: "INR" },
        { id: "pay_ok1", status: "captured", amount: 50000, currency: "INR" },
      ),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been paid — we've updated it/);
    expect(res.body.razorpayOrder).toBeUndefined();

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_ok1");
    expect(after.paymentSource).toBe("resume");
    await vi.waitFor(async () =>
      expect(await Notification.countDocuments({ user: order.user, title: "Payment confirmed" })).toBe(1),
    );
  });

  it("4. only failed attempts so far: checkout is offered again", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("attempted"));
    fetchPayments.mockResolvedValue(
      payments({ id: "pay_fail1", status: "failed", amount: 50000, currency: "INR" }),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.razorpayOrder).toEqual({ id: RZP_ORDER_ID, amount: 50000, currency: "INR" });
    expect(res.body.razorpayKeyId).toBe("test-key-id");
  });

  it("5. a recent attempt still in flight: checkout is still offered (no 30-minute block)", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("attempted"));
    fetchPayments.mockResolvedValue(
      payments({
        id: "pay_inflight1",
        status: "created",
        amount: 50000,
        currency: "INR",
        created_at: Math.floor(Date.now() / 1000) - 60,
      }),
    );

    const res = await resume(order, token);

    expect(res.status).toBe(200);
    expect(res.body.razorpayOrder).toEqual({ id: RZP_ORDER_ID, amount: 50000, currency: "INR" });
  });

  it("6a. Razorpay's payment list can't be fetched: 502, no checkout, nothing written", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("attempted"));
    fetchPayments.mockRejectedValue(new Error("Razorpay unavailable"));

    const res = await resume(order, token);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.razorpayOrder).toBeUndefined();
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("6b. Razorpay says paid but lists no captured payment (inconclusive): 502, not marked paid", async () => {
    const { order, token } = await unpaidOrder();
    fetchOrder.mockResolvedValue(razorpayOrder("paid"));
    fetchPayments.mockResolvedValue(payments());

    const res = await resume(order, token);

    expect(res.status).toBe(502);
    expect(res.body.razorpayOrder).toBeUndefined();
    expect((await Order.findById(order._id)).isPaid).toBe(false);
  });

  it("7. already-paid and cancelled orders keep their existing answers, without asking Razorpay", async () => {
    const paid = await unpaidOrder({ isPaid: true });
    const paidRes = await resume(paid.order, paid.token);
    expect(paidRes.status).toBe(400);
    expect(paidRes.body.message).toBe("This order has already been paid.");

    const cancelled = await unpaidOrder({ orderStatus: "Cancelled" });
    const cancelledRes = await resume(cancelled.order, cancelled.token);
    expect(cancelledRes.status).toBe(400);
    expect(cancelledRes.body.message).toBe("This order has been cancelled — please place a new order.");

    expect(fetchOrder).not.toHaveBeenCalled();
    expect(fetchPayments).not.toHaveBeenCalled();
  });
});
