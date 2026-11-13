import Order from "../models/Order.js";
import Review from "../models/Review.js";
import { sendEmail } from "../config/mailer.js";
import { escapeHtml } from "./escapeHtml.js";
import { loadReturnedQuantities, getSolicitableItems } from "./reviewEligibility.js";
import { getDeliveryFeedbackInfo } from "./deliveryFeedback.js";
import { reminderOptOutFooterHtml } from "./reminderOptOut.js";
import { REVIEW_BONUS_POINTS } from "../controllers/reviewController.js";

// The review-collection emails, all run by the one daily cron
// (GET/POST /api/orders/send-review-requests):
//   Day 1  — "Did your order arrive safely?"  (delivered 24–72 hours ago)
//   Day 8  — the review request               (delivered 8–30 days ago)
//   Day 14 — one reminder, only for items still unreviewed (14–30 days)
// Nothing goes out more than 30 days after delivery. All three respect the
// reminder-email opt-out (utils/reminderOptOut.js); order, payment and
// other service emails never look at it.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const REVIEW_EMAIL_WINDOWS = {
  feedback: { from: 24 * HOUR, to: 72 * HOUR },
  request: { from: 8 * DAY, to: 30 * DAY },
  reminder: { from: 14 * DAY, to: 30 * DAY },
};
export const REVIEW_EMAIL_MAX_ATTEMPTS = 3;
// Day 8 -> Day 14: the reminder never comes sooner than this after the request.
export const REVIEW_REMINDER_MIN_GAP = 6 * DAY;

const maskId = (id) => `…${String(id).slice(-6)}`;
const shortOrderNumber = (id) => String(id).slice(-8).toUpperCase();

// ============================
// Claim-then-send for one email, built for "never a duplicate"
// ============================
// A claim is taken only while none is held, and is never taken over later
// — so a send that crashed after the email left, but before sentAt was
// written, can't send it again. Only a definite refusal from the email
// provider is retried, up to REVIEW_EMAIL_MAX_ATTEMPTS: a 4xx answer means
// Brevo did not accept the email. A 5xx (a gateway can answer 502/504
// after the email was already accepted), a timeout or a network error
// leaves it unknown whether the email went out, so those are not retried.
// Returns "sent", "failed" (will retry), "gave_up" or "skipped".
const isDefiniteRefusal = (error) => /^Brevo send failed \(4\d\d\)/.test(error?.message || "");

export const sendReviewNotice = async ({ orderId, notice, send, onSent = {} }) => {
  const path = `reviewNotices.${notice}`;
  const claimedAt = new Date();

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      [`${path}.sentAt`]: null,
      [`${path}.gaveUpAt`]: null,
      [`${path}.claimedAt`]: null,
      [`${path}.attempts`]: { $not: { $gte: REVIEW_EMAIL_MAX_ATTEMPTS } },
    },
    { $set: { [`${path}.claimedAt`]: claimedAt }, $inc: { [`${path}.attempts`]: 1 } },
    { new: true },
  );

  if (!claimed) return "skipped";

  try {
    await send(claimed);
  } catch (error) {
    const attempts = claimed.reviewNotices?.[notice]?.attempts || 1;
    const retry = isDefiniteRefusal(error) && attempts < REVIEW_EMAIL_MAX_ATTEMPTS;
    const code = isDefiniteRefusal(error) ? "provider_refused" : "uncertain_delivery";

    // Order id and a short code only — never the address or the email body.
    console.error(`[review-emails] ${notice} order=${orderId} attempt=${attempts} failed (${code})`);

    await Order.updateOne(
      { _id: orderId, [`${path}.claimedAt`]: claimedAt },
      retry
        ? { $set: { [`${path}.claimedAt`]: null, [`${path}.lastError`]: code } }
        : { $set: { [`${path}.gaveUpAt`]: new Date(), [`${path}.lastError`]: code } },
    );
    return retry ? "failed" : "gave_up";
  }

  await Order.updateOne(
    { _id: orderId, [`${path}.claimedAt`]: claimedAt },
    { $set: { [`${path}.sentAt`]: new Date(), ...onSent } },
  );
  return "sent";
};

// ============================
// Templates (English / Hindi by the customer's preferredLanguage)
// ============================
const productReviewUrl = (item) => {
  const product = item.product;
  const isPopulated = product && typeof product === "object";
  const productId = isPopulated ? product._id : product;
  // #reviews scrolls straight to (and auto-opens) the review form — see
  // ProductReviews.jsx.
  return `${process.env.CLIENT_URL}/product/${productId}${
    isPopulated && product.slug ? `/${encodeURIComponent(product.slug)}` : ""
  }#reviews`;
};

// "Namaste {name} ji," — or just "Namaste," when there's no name.
const greeting = (user, hi) => {
  const name = escapeHtml(user.name || "").trim();
  if (hi) return name ? `नमस्ते ${name} जी,` : "नमस्ते,";
  return name ? `Namaste ${name} ji,` : "Namaste,";
};

export const buildFeedbackEmail = ({ order, user, footer }) => {
  const hi = user.preferredLanguage === "hi";
  const number = shortOrderNumber(order._id);
  const url = `${process.env.CLIENT_URL}/my-orders/${order._id}`;

  return hi
    ? {
        subject: "आपकी Mittal Collections डिलीवरी कैसी रही?",
        html: `
          <p>${greeting(user, true)}</p>
          <p>Mittal Collections से खरीदारी करने के लिए धन्यवाद। आपका ऑर्डर #${number} डिलीवर हो गया है।</p>
          <p><strong>क्या आपका सामान सुरक्षित और सही हालत में पहुँचा?</strong></p>
          <p><a href="${url}">अपने ऑर्डर पेज पर बताएं</a></p>
          <p>अगर कुछ ठीक नहीं है, तो "नहीं, मुझे मदद चाहिए" चुनें और कुछ शब्दों में बताएं। हमारी सपोर्ट टीम जल्द से जल्द आपसे संपर्क करेगी।</p>
          <p>— टीम Mittal Collections</p>
          ${footer}
        `,
      }
    : {
        subject: "How was your Mittal Collections delivery?",
        html: `
          <p>${greeting(user, false)}</p>
          <p>Thank you for shopping with Mittal Collections. Your order #${number} has been delivered.</p>
          <p><strong>Did everything arrive safely and in good condition?</strong></p>
          <p><a href="${url}">Tell us on your order page</a></p>
          <p>If something isn't right, choose "No, I need help" and tell us in a few words. Our support team will get back to you as soon as possible.</p>
          <p>— Team Mittal Collections</p>
          ${footer}
        `,
      };
};

// The Day-8 request keeps its existing wording; only the opt-out footer is new.
export const buildRequestEmail = ({ order, user, items, footer }) => {
  const itemsHtml = items
    .map((item) => `<li>${escapeHtml(item.name)} — <a href="${productReviewUrl(item)}">Leave a review</a></li>`)
    .join("");

  return {
    subject: "How was your order? Leave a review",
    html: `
            <p>Hi ${escapeHtml(user.name || "there")},</p>
            <p>Hope you're enjoying your order from Mittal Collections! Got a
            minute to share what you think? It really helps other shoppers.</p>
            <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;font-weight:bold;color:#92400e;">
                🎁 Mittal Collections is rewarding you — leave a review and get
                ${REVIEW_BONUS_POINTS} bonus loyalty points!
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#92400e;">
                *Points are credited once your review is approved. Terms and
                conditions apply.
              </p>
            </div>
            <ul>${itemsHtml}</ul>
            <p>Order ID: ${order._id}</p>
            ${footer}
          `,
  };
};

export const buildReminderEmail = ({ user, items, footer }) => {
  const hi = user.preferredLanguage === "hi";
  const list = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.name)} — <a href="${productReviewUrl(item)}">${hi ? "रिव्यू लिखें" : "Write a review"}</a></li>`,
    )
    .join("");

  return hi
    ? {
        subject: "आपके रिव्यू के लिए एक छोटा-सा रिमाइंडर",
        html: `
          <p>${greeting(user, true)}</p>
          <p>अगर आपके पास एक मिनट हो, तो हमें इनके बारे में आपकी सच्ची राय जानकर खुशी होगी:</p>
          <ul>${list}</ul>
          <p>यह हमारा एकमात्र रिमाइंडर है। इस ऑर्डर के रिव्यू के लिए हम आपको दोबारा ईमेल नहीं करेंगे।</p>
          <p>प्रकाशित रिव्यू पर ${REVIEW_BONUS_POINTS} लॉयल्टी पॉइंट्स (प्रति ऑर्डर एक बार) मिलते हैं, रेटिंग चाहे जो हो।</p>
          <p>— टीम Mittal Collections</p>
          ${footer}
        `,
      }
    : {
        subject: "A gentle reminder about your review",
        html: `
          <p>${greeting(user, false)}</p>
          <p>If you have a minute, we'd still love your honest opinion of:</p>
          <ul>${list}</ul>
          <p>This is our only reminder. We won't email you again about reviewing this order.</p>
          <p>A published review earns ${REVIEW_BONUS_POINTS} loyalty points (once per order), whatever rating you give.</p>
          <p>— Team Mittal Collections</p>
          ${footer}
        `,
      };
};

// ============================
// The daily run
// ============================
const inWindow = (window, now) => ({
  $gte: new Date(now.getTime() - window.to),
  $lte: new Date(now.getTime() - window.from),
});

const notYetHandled = (notice) => ({
  [`reviewNotices.${notice}.sentAt`]: null,
  [`reviewNotices.${notice}.gaveUpAt`]: null,
});

const USER_FIELDS = "name email preferredLanguage reminderEmailsOptOut";

const emptyReport = () => ({ candidates: 0, eligible: 0, sent: 0, failed: 0, gaveUp: 0, skipped: {}, orders: [] });

const skip = (report, reason) => {
  report.skipped[reason] = (report.skipped[reason] || 0) + 1;
};

// "productId" strings this batch's customers have already reviewed.
const loadReviewedKeys = async (orders) => {
  const userIds = [...new Set(orders.map((o) => o.user?._id).filter(Boolean).map(String))];
  if (userIds.length === 0) return new Set();
  const reviews = await Review.find({ user: { $in: userIds } }).select("user product").lean();
  return new Set(reviews.map((r) => `${r.user}:${r.product}`));
};

const productIdOf = (item) =>
  item.product && typeof item.product === "object" && item.product._id ? item.product._id : item.product;

const unreviewed = (order, items, reviewedKeys) =>
  items.filter((item) => !reviewedKeys.has(`${order.user._id}:${productIdOf(item)}`));

// Common per-customer checks. Returns a skip reason or null. A claim with
// no sentAt is a send that may or may not have gone out (it crashed, or is
// running in an overlapping cron call) — reported, never re-sent.
const customerSkipReason = (order, notice) => {
  if (!order.user?.email) return "no_email";
  if (order.user.reminderEmailsOptOut) return "opted_out";
  if (order.reviewNotices?.[notice]?.claimedAt) return "claimed_not_confirmed";
  return null;
};

const deliver = async ({ report, order, notice, dryRun, build, onSent }) => {
  report.eligible += 1;

  if (dryRun) {
    report.orders.push(maskId(order._id));
    return;
  }

  // One order's trouble (a database blip) never stops the rest of the
  // batch. If it happens after the claim, the claim stays held and the
  // order shows up as claimed_not_confirmed — never re-sent.
  try {
    // Built before the claim: a problem preparing the email is not a send,
    // so it must not use up an attempt or end retries. The footer helper
    // already returns "" on its own errors.
    const lang = notice !== "request" && order.user.preferredLanguage === "hi" ? "hi" : "en";
    const footer = await reminderOptOutFooterHtml(order.user._id, { lang });
    const { subject, html } = build(footer);

    const result = await sendReviewNotice({
      orderId: order._id,
      notice,
      onSent,
      send: () => sendEmail({ to: order.user.email, subject, html }),
    });

    // The Day-8 request keeps the admin copy it always had — but as its own
    // email built without the footer, since the footer carries this
    // customer's personal unsubscribe link (a BCC would hand that link to
    // the admin mailbox). Best effort: it never affects the customer's send.
    if (result === "sent" && notice === "request" && process.env.ADMIN_NOTIFICATION_EMAIL) {
      const adminCopy = build("");
      sendEmail({ to: process.env.ADMIN_NOTIFICATION_EMAIL, subject: adminCopy.subject, html: adminCopy.html }).catch(
        (error) => console.error(`[review-emails] admin copy order=${order._id} failed: ${error?.message || error}`),
      );
    }

    if (result === "sent") report.sent += 1;
    else if (result === "failed") report.failed += 1;
    else if (result === "gave_up") report.gaveUp += 1;
    else skip(report, "concurrent_claim");
  } catch (error) {
    report.errors = (report.errors || 0) + 1;
    console.error(`[review-emails] ${notice} order=${order._id} not processed: ${error?.message || error}`);
  }
};

// dryRun: reads only — no claim, no sentAt, no opt-out token, no email.
export const runReviewEmails = async ({ dryRun = false, now = new Date() } = {}) => {
  const base = { orderStatus: "Delivered", isActive: { $ne: false } };

  // ---- Day 1: delivery feedback ----
  const feedback = emptyReport();
  const feedbackOrders = await Order.find({
    ...base,
    deliveredAt: inWindow(REVIEW_EMAIL_WINDOWS.feedback, now),
    "deliveryFeedback.response": { $exists: false },
    ...notYetHandled("feedback"),
  }).populate("user", USER_FIELDS);
  feedback.candidates = feedbackOrders.length;

  for (const order of feedbackOrders) {
    const reason = customerSkipReason(order, "feedback") || (getDeliveryFeedbackInfo(order, now).canSubmit ? null : "feedback_not_open");
    if (reason) {
      skip(feedback, reason);
      continue;
    }
    await deliver({
      report: feedback,
      order,
      notice: "feedback",
      dryRun,
      build: (footer) => buildFeedbackEmail({ order, user: order.user, footer }),
    });
  }

  // ---- Day 8: review request ----
  const request = emptyReport();
  const requestOrders = await Order.find({
    ...base,
    deliveredAt: inWindow(REVIEW_EMAIL_WINDOWS.request, now),
    reviewRequestSent: { $ne: true },
    ...notYetHandled("request"),
  })
    .populate("user", USER_FIELDS)
    .populate("orderItems.product", "slug");
  request.candidates = requestOrders.length;

  // Returned units (any return request that wasn't Rejected) are never
  // asked about; whatever the customer kept still is, down to a partial
  // quantity of one line. One query each for the whole batch.
  const requestReturned = await loadReturnedQuantities(requestOrders.map((o) => o._id));
  const requestReviewed = await loadReviewedKeys(requestOrders);

  for (const order of requestOrders) {
    const reason = customerSkipReason(order, "request");
    if (reason) {
      skip(request, reason);
      continue;
    }
    const items = unreviewed(order, getSolicitableItems(order, requestReturned), requestReviewed);
    // Nothing left to ask about — left unclaimed, so an item whose return
    // is later Rejected is picked up on a later run.
    if (items.length === 0) {
      skip(request, "no_eligible_items");
      continue;
    }
    await deliver({
      report: request,
      order,
      notice: "request",
      dryRun,
      // reviewRequestSent stays the record older orders were marked with,
      // so an order emailed before this change is never asked twice.
      onSent: { reviewRequestSent: true },
      build: (footer) => buildRequestEmail({ order, user: order.user, items, footer }),
    });
  }

  // ---- Day 14: one reminder ----
  const reminder = emptyReport();
  const reminderOrders = await Order.find({
    ...base,
    deliveredAt: inWindow(REVIEW_EMAIL_WINDOWS.reminder, now),
    reviewRequestSent: true,
    // A reminder only follows a request that went out at least
    // REVIEW_REMINDER_MIN_GAP ago — so a request sent late (cron outage,
    // a return rejected later, a retry) is never chased by its reminder in
    // the same run. Orders the old code flagged have no request.sentAt and
    // keep today's behaviour.
    $or: [
      { "reviewNotices.request.sentAt": { $lte: new Date(now.getTime() - REVIEW_REMINDER_MIN_GAP) } },
      { "reviewNotices.request.sentAt": null },
    ],
    ...notYetHandled("reminder"),
  })
    .populate("user", USER_FIELDS)
    .populate("orderItems.product", "slug");
  reminder.candidates = reminderOrders.length;

  const reminderReturned = await loadReturnedQuantities(reminderOrders.map((o) => o._id));
  const reminderReviewed = await loadReviewedKeys(reminderOrders);

  for (const order of reminderOrders) {
    const reason = customerSkipReason(order, "reminder");
    if (reason) {
      skip(reminder, reason);
      continue;
    }
    const items = unreviewed(order, getSolicitableItems(order, reminderReturned), reminderReviewed);
    if (items.length === 0) {
      skip(reminder, "no_eligible_items");
      continue;
    }
    await deliver({
      report: reminder,
      order,
      notice: "reminder",
      dryRun,
      build: (footer) => buildReminderEmail({ user: order.user, items, footer }),
    });
  }

  if (!dryRun) {
    for (const report of [feedback, request, reminder]) delete report.orders;
  }

  return { dryRun, feedback, request, reminder };
};
