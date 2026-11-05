// Delivery feedback ("Did you receive your product safely?") — who may
// answer, until when, and what they may still do. Private to the order's
// owner and admins; never part of any public response.

export const DELIVERY_FEEDBACK_WINDOW_DAYS = 30;
export const ISSUE_MESSAGE_MIN_LENGTH = 10;
export const ISSUE_MESSAGE_MAX_LENGTH = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// When the order actually reached the customer, or null if that can't be
// established. deliveredAt is written once, on the first Delivered
// transition (updateOrderStatus), and never cleared — so it survives a
// later Delivered -> Cancelled. The Delivered statusHistory entry is the
// fallback for an order missing deliveredAt. A current status of
// "Delivered" alone carries no date, so it is NOT enough here: without a
// date the 30-day window can't be worked out, and no date is guessed.
export const getDeliveryTime = (order) => {
  if (order.deliveredAt instanceof Date && !Number.isNaN(order.deliveredAt.getTime())) {
    return order.deliveredAt;
  }

  const entry = (order.statusHistory || []).find(
    (h) => h.status === "Delivered" && h.changedAt instanceof Date && !Number.isNaN(h.changedAt.getTime()),
  );

  return entry ? entry.changedAt : null;
};

// What this customer can do with this order's delivery feedback right now.
// reason is set whenever nothing can be submitted.
export const getDeliveryFeedbackInfo = (order, now = new Date()) => {
  const deliveredAt = order.isActive === false ? null : getDeliveryTime(order);

  if (!deliveredAt) {
    return { eligible: false, canSubmit: false, canReportIssue: false, deadline: null, reason: "not_delivered" };
  }

  const deadline = new Date(deliveredAt.getTime() + DELIVERY_FEEDBACK_WINDOW_DAYS * DAY_MS);
  const open = now <= deadline;
  const feedback = order.deliveryFeedback;
  const response = feedback?.response || null;

  // First answer: anything, while the window is open. Afterwards only one
  // change is possible — "Yes" to "No" — and only once, in the same window.
  const canSubmit = open && !response;
  const canReportIssue = open && (!response || (response === "yes" && !feedback.correctedAt));

  let reason = null;
  if (!canSubmit && !canReportIssue) reason = open ? "already_submitted" : "window_closed";

  return { eligible: true, canSubmit, canReportIssue, deadline, reason };
};
