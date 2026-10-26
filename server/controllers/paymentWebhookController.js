import crypto from "crypto";
import Order from "../models/Order.js";
import {
  markOrderPaid,
  flagPaymentReview,
  notifyPaymentConfirmed,
} from "../utils/orderPayment.js";

// ============================
// Razorpay Webhook
// ============================
// Razorpay tells us directly when a payment succeeds, instead of us only
// hearing it from the customer's browser (verify-payment, which never
// fires if the tab closes right after paying) or the pending-payment cron
// (every few minutes, and only for recent orders). Every paid transition
// goes through markOrderPaid, so this path shares its guarantees: one
// atomic, idempotent paid write; a payment that lands after the order was
// cancelled or switched to COD is flagged for an admin and never revives
// the order; a second payment id on a paid order is flagged once.
//
// This handler never captures, refunds or cancels anything.
//
// Mounted in app.js BEFORE express.json(): the signature is an HMAC over
// the exact raw request bytes, so req.body here is the untouched Buffer.

// Events that mean money was captured. Everything else is logged only —
// an authorized-but-uncaptured payment is the pending-payment cron's call
// (it never captures either; see processDueOrder).
const PAID_EVENTS = new Set(["payment.captured", "order.paid"]);
const LOG_ONLY_EVENTS = new Set(["payment.authorized", "payment.failed"]);

// Razorpay ids are short alphanumeric strings (order_…, pay_…). Anything
// else — including a JSON object — is never put into a query.
const RAZORPAY_ID = /^[A-Za-z0-9_]{1,64}$/;
const asRazorpayId = (value) =>
  typeof value === "string" && RAZORPAY_ID.test(value) ? value : null;

// Only ids and outcomes are logged — never the body, the signature or a
// secret.
const log = (fields) =>
  console.log(
    `[razorpay-webhook] ${Object.entries(fields)
      .map(([key, value]) => `${key}=${value ?? "-"}`)
      .join(" ")}`,
  );

const signatureMatches = (rawBody, signature, secret) => {
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
    "utf8",
  );
  const received = Buffer.from(signature.toLowerCase(), "utf8");

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Fail closed: without the secret nothing can be verified.
  if (!secret) {
    console.error("[razorpay-webhook] CONFIG ERROR: RAZORPAY_WEBHOOK_SECRET is not set — delivery rejected");
    return res.status(503).json({ success: false, message: "Webhook not configured" });
  }

  const signature = req.get("X-Razorpay-Signature");
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;

  if (typeof signature !== "string" || !/^[0-9a-fA-F]{64}$/.test(signature) || !rawBody) {
    log({ result: "missing-or-malformed-signature" });
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  if (!signatureMatches(rawBody, signature, secret)) {
    log({ result: "bad-signature" });
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    log({ result: "malformed-json" });
    return res.status(400).json({ success: false, message: "Malformed payload" });
  }

  const type = typeof event?.event === "string" ? event.event : "";
  const eventId = asRazorpayId(req.get("X-Razorpay-Event-Id"));
  const payment = event?.payload?.payment?.entity;
  const razorpayOrder = event?.payload?.order?.entity;
  const paymentId = asRazorpayId(payment?.id);
  const razorpayOrderId = asRazorpayId(payment?.order_id ?? razorpayOrder?.id);
  const base = { event: type || "unknown", eventId, rzpOrder: razorpayOrderId, payment: paymentId };

  if (LOG_ONLY_EVENTS.has(type)) {
    log({ ...base, result: "logged-only" });
    return res.status(200).json({ success: true });
  }

  if (!PAID_EVENTS.has(type)) {
    log({ ...base, result: "ignored" });
    return res.status(200).json({ success: true });
  }

  if (!paymentId || !razorpayOrderId || payment?.status !== "captured") {
    log({ ...base, result: "skipped-incomplete-payload" });
    return res.status(200).json({ success: true });
  }

  try {
    const order = await Order.findOne({ razorpayOrderId: { $eq: razorpayOrderId } }).select(
      "_id user paymentMethod totalPrice",
    );

    if (!order) {
      log({ ...base, result: "unknown-order" });
      return res.status(200).json({ success: true });
    }

    // What was captured must be what the order asked for. A COD-converted
    // order's total has since changed (COD charge), so only the currency
    // and Razorpay's own order amount are compared there — markOrderPaid
    // flags that payment for review regardless.
    const amountMatches =
      payment.currency === "INR" &&
      (razorpayOrder?.amount === undefined || payment.amount === razorpayOrder.amount) &&
      (order.paymentMethod !== "Razorpay" || payment.amount === Math.round(order.totalPrice * 100));

    if (!amountMatches) {
      // Evidence for the admin: recorded once per payment id in a single
      // atomic write (a replay or a concurrent delivery matches nothing).
      await Order.updateOne(
        { _id: order._id, "mismatchedPayments.paymentId": { $ne: paymentId } },
        {
          $push: {
            mismatchedPayments: {
              paymentId,
              amount: Number.isFinite(payment.amount) ? payment.amount : null,
              currency: typeof payment.currency === "string" ? payment.currency.slice(0, 8) : null,
              receivedAt: new Date(),
            },
          },
        },
      );
      await flagPaymentReview(order._id, "amount_mismatch", { deferAlert: true });
      log({ ...base, order: order._id, result: "amount-mismatch-flagged" });
      return res.status(200).json({ success: true });
    }

    const result = await markOrderPaid({
      orderId: order._id,
      razorpayOrderId,
      paymentId,
      source: "webhook",
      deferAlert: true,
    });

    if (result.status === "paid" && !result.order.paidAfterCancellation) {
      notifyPaymentConfirmed(result.order);
    }

    log({
      ...base,
      order: order._id,
      result: result.status === "paid" && result.order.paidAfterCancellation
        ? `paid-late-${result.order.paymentReviewReason}`
        : result.status,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    // A database hiccup: answer non-2xx so Razorpay retries the delivery
    // (safe — markOrderPaid is idempotent).
    console.error(`[razorpay-webhook] event=${type} rzpOrder=${razorpayOrderId} error:`, error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
