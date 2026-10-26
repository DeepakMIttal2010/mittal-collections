import Order from "../models/Order.js";
import User from "../models/User.js";
import { sendEmail } from "../config/mailer.js";
import { escapeHtml } from "./escapeHtml.js";
import { notifyUser } from "./notify.js";
import { getPendingPaymentConfig } from "../config/pendingPayment.js";

// ============================
// Mark an order paid (single atomic write)
// ============================
// Every path that learns a Razorpay payment succeeded — the checkout's
// signature verify, the "Pay Now" self-heal, the pending-payment cron's
// API reconciliation (and later the webhook) — goes through here, so they
// can't disagree or race each other into a bad state.
//
// The filter (isPaid != true) makes it idempotent: a second caller for
// the same payment matches nothing. Whether the money arrived too late —
// the order was already Cancelled, or an admin had switched it to Cash on
// Delivery — is decided INSIDE the same update from the document as it is
// at write time (an update pipeline), not from an earlier read: a cancel
// landing between a read and a save used to leave an order Cancelled +
// paid with no flag and no admin alert. Such an order is flagged for
// manual review and never revived or fulfilled automatically.
const lateReason = {
  $switch: {
    branches: [
      { case: { $ne: ["$paymentMethod", "Razorpay"] }, then: "paid_after_cod_conversion" },
      { case: { $eq: ["$orderStatus", "Cancelled"] }, then: "paid_after_cancellation" },
    ],
    default: null,
  },
};

// `deferAlert: true` (the Razorpay webhook) sends any admin alert in the
// background instead of holding the caller's response until the email is
// out — see alertAdmin below.
export const markOrderPaid = async ({ orderId, razorpayOrderId, paymentId, source, deferAlert = false }) => {
  // Checked here, at the query, rather than trusting every caller: the
  // verify endpoint passes values straight from the request body, and a
  // JSON object in place of a string would act as a query operator.
  if (typeof razorpayOrderId !== "string" || !razorpayOrderId) {
    return { status: "not_found", order: null };
  }
  if (paymentId !== undefined && paymentId !== null && typeof paymentId !== "string") {
    return { status: "not_found", order: null };
  }

  const isLate = { $ne: ["$_lateReason", null] };
  const settlesOpenReview = {
    $and: [{ $eq: ["$_lateReason", null] }, { $eq: ["$paymentReviewNeeded", true] }],
  };

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, razorpayOrderId: { $eq: razorpayOrderId }, isPaid: { $ne: true } },
    [
      { $set: { _lateReason: lateReason } },
      {
        $set: {
          isPaid: true,
          paidAt: "$$NOW",
          razorpayPaymentId: paymentId || "",
          paymentSource: source,
          nextPaymentCheckAt: null,
          paidAfterCancellation: isLate,
          // A normal payment settles an open "authorized / inconclusive"
          // review on a still-live order; a late one opens a fresh review.
          paymentReviewNeeded: isLate,
          paymentReviewReason: { $ifNull: ["$_lateReason", "$paymentReviewReason"] },
          paymentReviewFlaggedAt: { $cond: [isLate, "$$NOW", "$paymentReviewFlaggedAt"] },
          paymentReviewResolvedAt: { $cond: [settlesOpenReview, "$$NOW", "$paymentReviewResolvedAt"] },
          paymentReviewResolvedBy: { $cond: [settlesOpenReview, "system", "$paymentReviewResolvedBy"] },
          "paymentNotices.reviewAlert": { $cond: [isLate, "$$REMOVE", "$paymentNotices.reviewAlert"] },
          "paymentNotices.reviewFollowUp": {
            $cond: [isLate, "$$REMOVE", "$paymentNotices.reviewFollowUp"],
          },
        },
      },
      { $unset: "_lateReason" },
    ],
    { new: true, updatePipeline: true },
  );

  if (updated) {
    if (updated.paidAfterCancellation) {
      await alertAdmin(updated._id, deferAlert);
    }

    return { status: "paid", order: updated };
  }

  const existing = await Order.findOne({ _id: orderId, razorpayOrderId: { $eq: razorpayOrderId } });

  if (!existing) return { status: "not_found", order: null };

  // Already paid with a DIFFERENT payment id — the customer may have been
  // charged twice for one order. Recorded once per payment id.
  if (paymentId && existing.razorpayPaymentId && existing.razorpayPaymentId !== paymentId) {
    const recorded = await Order.findOneAndUpdate(
      { _id: existing._id, extraPaymentIds: { $ne: String(paymentId) } },
      { $addToSet: { extraPaymentIds: paymentId } },
      { new: true },
    );

    if (recorded) await flagPaymentReview(existing._id, "duplicate_payment", { deferAlert });
  }

  return { status: "already_paid", order: existing };
};

// In-app "payment confirmed" note for a payment the customer's own
// checkout didn't confirm (the cron's reconciliation, the Razorpay
// webhook). Callers send it only on the actual paid transition and never
// for a late payment on a cancelled / COD-converted order.
export const notifyPaymentConfirmed = (order) =>
  notifyUser({
    userId: order.user,
    type: "order_status",
    title: "Payment confirmed",
    message: `We've confirmed your payment for order ${order._id} — it's now being processed.`,
    link: `/my-orders/${order._id}`,
  });

// ============================
// Manual payment review
// ============================
export const PAYMENT_REVIEW_LABELS = {
  authorized_uncaptured: "Payment authorized but not captured",
  check_inconclusive: "Razorpay status could not be confirmed",
  amount_mismatch: "Paid amount doesn't match the order",
  paid_after_cancellation: "Paid after the order was cancelled",
  paid_after_cod_conversion: "Paid online after conversion to COD",
  duplicate_payment: "Second payment on an already-paid order",
};

// Sends the review alert now, or — for a caller that must answer quickly
// (the Razorpay webhook waits only a few seconds per delivery, and an email
// can take up to 10) — in the background. Either way the alert goes through
// the same claim/lease as always: an email that fails or never finishes is
// left unsent and the pending-payment cron's alert sweep retries it, so
// deferring never marks anything as sent that wasn't.
const alertAdmin = async (orderId, deferAlert) => {
  if (!deferAlert) {
    await sendPaymentReviewAlert(orderId);
    return;
  }

  sendPaymentReviewAlert(orderId).catch((error) =>
    console.error(`[pending-payment] background review alert for order ${orderId} failed:`, error),
  );
};

// Opens a review (only if none is open) and alerts the admin once.
export const flagPaymentReview = async (orderId, reason, { deferAlert = false } = {}) => {
  const flagged = await Order.findOneAndUpdate(
    { _id: orderId, paymentReviewNeeded: { $ne: true } },
    {
      $set: {
        paymentReviewNeeded: true,
        paymentReviewReason: reason,
        paymentReviewFlaggedAt: new Date(),
        paymentReviewResolvedAt: null,
        paymentReviewResolvedBy: null,
        paymentReviewNote: null,
      },
      $unset: { "paymentNotices.reviewAlert": 1, "paymentNotices.reviewFollowUp": 1 },
    },
    { new: true },
  );

  if (flagged) await alertAdmin(flagged._id, deferAlert);

  return Boolean(flagged);
};

// ============================
// Claim-then-send for one message
// ============================
// The claim is a lease: a send that crashed mid-way is retried once the
// lease runs out, and a failed send releases it straight away so the next
// cron run retries — up to reminderMaxAttempts. sentAt is written only
// after the send succeeded, so a duplicate needs a crash in the instant
// between the two.
export const NOTICE_LEASE_MS = 10 * 60 * 1000;

// Returns "sent", "failed" (released for a later retry), "leased" (another
// run holds a live claim — possibly one that crashed mid-send; the caller
// should look again once the lease runs out) or "skipped" (already sent,
// out of attempts, or the order no longer qualifies).

export const sendOrderNotice = async ({ orderId, notice, filter = {}, send }) => {
  const { reminderMaxAttempts } = getPendingPaymentConfig();
  const path = `paymentNotices.${notice}`;
  const claimedAt = new Date();

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      ...filter,
      [`${path}.sentAt`]: null,
      [`${path}.attempts`]: { $not: { $gte: reminderMaxAttempts } },
      $or: [
        { [`${path}.claimedAt`]: null },
        { [`${path}.claimedAt`]: { $lte: new Date(claimedAt - NOTICE_LEASE_MS) } },
      ],
    },
    { $set: { [`${path}.claimedAt`]: claimedAt }, $inc: { [`${path}.attempts`]: 1 } },
    { new: true },
  );

  if (!claimed) {
    const current = await Order.findById(orderId).select(path).lean();
    const state = current?.paymentNotices?.[notice];
    const leaseLive =
      state && !state.sentAt && state.claimedAt && new Date(state.claimedAt) > new Date(claimedAt - NOTICE_LEASE_MS);

    return leaseLive ? "leased" : "skipped";
  }

  try {
    await send(claimed);
    await Order.updateOne(
      { _id: orderId, [`${path}.claimedAt`]: claimedAt },
      { $set: { [`${path}.sentAt`]: new Date() } },
    );
    return "sent";
  } catch (error) {
    console.error(
      `[pending-payment] notice=${notice} order=${orderId} attempt=${claimed.paymentNotices?.[notice]?.attempts} send failed:`,
      error,
    );
    await Order.updateOne(
      { _id: orderId, [`${path}.claimedAt`]: claimedAt },
      { $set: { [`${path}.claimedAt`]: null } },
    );
    return "failed";
  }
};

// ============================
// Admin alert for a review
// ============================
// Without ADMIN_NOTIFICATION_EMAIL there's nowhere to send it: nothing
// is claimed or counted as an attempt, so the cron's alert sweep keeps
// retrying (and logging) until the variable is set.
export const sendPaymentReviewAlert = async (orderId, { followUp = false } = {}) => {
  if (!process.env.ADMIN_NOTIFICATION_EMAIL) {
    console.error(
      `[pending-payment] CONFIG ERROR: ADMIN_NOTIFICATION_EMAIL is not set — payment review alert for order ${orderId} not sent; it will be retried on every run until it is set`,
    );
    return "config_missing";
  }

  return sendOrderNotice({
    orderId,
    notice: followUp ? "reviewFollowUp" : "reviewAlert",
    filter: { paymentReviewNeeded: true },
    send: async (order) => {
      const to = process.env.ADMIN_NOTIFICATION_EMAIL;
      const label = PAYMENT_REVIEW_LABELS[order.paymentReviewReason] || order.paymentReviewReason;
      const paymentIds = [order.razorpayPaymentId, ...(order.extraPaymentIds || [])].filter(Boolean);
      const mismatched = (order.mismatchedPayments || [])
        .map((p) => `${p.paymentId} (${Number.isFinite(p.amount) ? `₹${(p.amount / 100).toFixed(2)}` : "amount ?"} ${p.currency || "?"})`)
        .join(", ");

      await sendEmail({
        to,
        subject: `${followUp ? "Still needs review" : "Action needed"}: ${label} — order ${order._id}`,
        html: `
          <p><strong>${escapeHtml(label)}</strong></p>
          <p>Order: ${order._id}<br>
          Status: ${escapeHtml(order.orderStatus)} · Payment method: ${escapeHtml(order.paymentMethod)} · Paid: ${order.isPaid ? "Yes" : "No"}<br>
          Total: ₹${order.totalPrice}<br>
          Razorpay order: ${escapeHtml(order.razorpayOrderId || "-")}<br>
          Razorpay payment(s): ${escapeHtml(paymentIds.join(", ") || "-")}${
            mismatched ? `<br>
          Mismatched payment(s): ${escapeHtml(mismatched)}` : ""
          }</p>
          <p>Nothing has been captured or refunded automatically. Check the Razorpay dashboard, then mark the order reviewed in the admin panel.</p>
          <p><a href="${process.env.CLIENT_URL}/admin/orders?highlight=${order._id}">Open the order</a></p>
        `,
      });
    },
  });
};

// ============================
// Customer messages
// ============================
export const formatIst = (date, isHindi = false) =>
  `${new Intl.DateTimeFormat(isHindi ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)} IST`;

const getCustomer = (userId) => User.findById(userId).select("name email preferredLanguage");

const PAYMENT_NOTICE_COPY = {
  reminder1: (order, name, isHindi) => ({
    subject: isHindi
      ? "आपका Mittal Collections ऑर्डर भुगतान का इंतज़ार कर रहा है"
      : "Your Mittal Collections order is awaiting payment",
    body: isHindi
      ? `नमस्ते ${name}, आपका Mittal Collections ऑर्डर #${order._id} भुगतान का इंतज़ार कर रहा है। अपने ऑर्डर के सुरक्षित पेमेंट लिंक से भुगतान पूरा करें।`
      : `Hi ${name}, your Mittal Collections order #${order._id} is awaiting payment. Complete your payment using the secure payment link provided for your order.`,
    linkText: isHindi ? "भुगतान पूरा करें" : "Complete payment",
  }),
  reminder2: (order, name, isHindi, expiresAt) => ({
    subject: isHindi
      ? "अंतिम रिमाइंडर: आपका ऑर्डर अभी भी भुगतान का इंतज़ार कर रहा है"
      : "Final reminder: your order is still awaiting payment",
    body: isHindi
      ? `नमस्ते ${name}, आपका ऑर्डर #${order._id} अभी भी भुगतान का इंतज़ार कर रहा है। अपने-आप रद्द होने से बचाने के लिए कृपया ${formatIst(expiresAt, true)} से पहले भुगतान पूरा करें।`
      : `Hi ${name}, your order #${order._id} is still awaiting payment. Please complete payment before ${formatIst(expiresAt)} to avoid automatic cancellation.`,
    linkText: isHindi ? "भुगतान पूरा करें" : "Complete payment",
  }),
  timeoutCancel: (order, name, isHindi) => ({
    subject: isHindi
      ? "भुगतान न मिलने के कारण आपका ऑर्डर रद्द कर दिया गया है"
      : "Your order has been cancelled — payment not received",
    body: isHindi
      ? `नमस्ते ${name}, आपका Mittal Collections ऑर्डर #${order._id} रद्द कर दिया गया है क्योंकि तय समय में भुगतान नहीं मिला। आप ${process.env.CLIENT_URL}/ पर नया ऑर्डर दे सकते हैं।`
      : `Hi ${name}, your Mittal Collections order #${order._id} has been cancelled because payment was not received within the allowed time. You can place a new order at ${process.env.CLIENT_URL}/.`,
    linkText: isHindi ? "शॉपिंग जारी रखें" : "Continue shopping",
    link: `${process.env.CLIENT_URL}/`,
  }),
};

// Only the customer's name, the order id, the expiry time and links to
// the site go into these — no gateway ids, amounts or addresses.
export const sendPaymentNotice = ({ orderId, notice, filter, expiresAt, notify }) =>
  sendOrderNotice({
    orderId,
    notice,
    filter,
    send: async (order) => {
      const customer = await getCustomer(order.user);

      if (!customer?.email) {
        console.error(`[pending-payment] notice=${notice} order=${order._id} skipped: customer has no email`);
        return;
      }

      const isHindi = customer.preferredLanguage === "hi";
      const name = escapeHtml(customer.name || (isHindi ? "ग्राहक" : "there"));
      const copy = PAYMENT_NOTICE_COPY[notice](order, name, isHindi, expiresAt);
      const link = copy.link || `${process.env.CLIENT_URL}/my-orders/${order._id}`;

      await sendEmail({
        to: customer.email,
        subject: copy.subject,
        html: `
          <p>${copy.body}</p>
          <p><a href="${link}">${copy.linkText}</a></p>
        `,
      });

      notify?.(order, copy.subject);
    },
  });
