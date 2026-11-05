import Order from "../models/Order.js";
import Ticket from "../models/Ticket.js";
import {
  getDeliveryFeedbackInfo,
  ISSUE_MESSAGE_MIN_LENGTH,
  ISSUE_MESSAGE_MAX_LENGTH,
} from "../utils/deliveryFeedback.js";
import { withOptionalTransaction, TransactionsUnavailableError } from "../utils/orderTransactions.js";
import { notifyAdmin } from "./ticketController.js";

const reject = (res, status, code, message) => res.status(status).json({ success: false, code, message });

const rejectUnavailable = (res, info) =>
  info.reason === "window_closed"
    ? reject(res, 403, "FEEDBACK_WINDOW_CLOSED", "The feedback period for this order has ended.")
    : reject(res, 409, "ALREADY_SUBMITTED", "Feedback for this order has already been submitted.");

// ============================
// SUBMIT DELIVERY FEEDBACK (Order owner)
// ============================
// "Did you receive your product safely?" — "yes", or "no" with a short
// description, which opens one support ticket in the existing Ticket
// system. One answer per order; a "yes" may become "no" once, within the
// same 30-day window (see utils/deliveryFeedback.js).
export const submitDeliveryFeedback = async (req, res) => {
  const { response } = req.body;

  if (response !== "yes" && response !== "no") {
    return reject(res, 400, "INVALID_RESPONSE", "Please choose Yes or No.");
  }

  let message = "";

  if (response === "no") {
    // typeof check first: an object-shaped body value must never reach
    // the database as anything but plain text.
    message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (message.length < ISSUE_MESSAGE_MIN_LENGTH || message.length > ISSUE_MESSAGE_MAX_LENGTH) {
      return reject(
        res,
        400,
        "INVALID_MESSAGE",
        `Please describe the problem in ${ISSUE_MESSAGE_MIN_LENGTH} to ${ISSUE_MESSAGE_MAX_LENGTH} characters.`,
      );
    }
  }

  try {
    const order = await Order.findById(req.params.id).select(
      "user isActive orderStatus deliveredAt statusHistory deliveryFeedback",
    );

    // Someone else's order answers exactly like a missing one — never
    // confirms that an order id exists.
    if (!order || order.user.toString() !== req.user._id.toString()) {
      return reject(res, 404, "ORDER_NOT_FOUND", "Order not found.");
    }

    const now = new Date();
    const info = getDeliveryFeedbackInfo(order, now);

    if (!info.eligible) {
      return reject(res, 403, "NOT_DELIVERED", "Feedback can be given once your order has been delivered.");
    }

    if (response === "yes" ? !info.canSubmit : !info.canReportIssue) {
      return rejectUnavailable(res, info);
    }

    const entry = { response, message, submittedAt: now };
    const isCorrection = response === "no" && order.deliveryFeedback?.response === "yes";

    // Each filter only matches the state the request was checked against,
    // so of two simultaneous or retried requests only one can write.
    const owner = { _id: order._id, user: req.user._id };
    const claimFilter = isCorrection
      ? { ...owner, "deliveryFeedback.response": "yes", "deliveryFeedback.correctedAt": { $exists: false } }
      : { ...owner, "deliveryFeedback.response": { $exists: false } };
    const claimUpdate = isCorrection
      ? {
          $set: {
            "deliveryFeedback.response": "no",
            "deliveryFeedback.message": message,
            "deliveryFeedback.correctedAt": now,
          },
          $push: { "deliveryFeedback.history": entry },
        }
      : { $set: { deliveryFeedback: { ...entry, ticket: null, history: [entry] } } };

    if (response === "yes") {
      const saved = await Order.findOneAndUpdate(claimFilter, claimUpdate, { new: true });

      if (!saved) return rejectUnavailable(res, { reason: "already_submitted" });

      return res.status(201).json({
        success: true,
        deliveryFeedback: saved.deliveryFeedback,
        deliveryFeedbackInfo: getDeliveryFeedbackInfo(saved, now),
      });
    }

    // "No": the answer and its ticket are saved together. With transactions
    // (production) both commit or neither does. Without them (allowed only
    // in tests — withOptionalTransaction refuses otherwise) anything already
    // written is undone below, so a failure never leaves an answer with no
    // ticket, or a ticket nobody can see from the order.
    let claimedWithoutSession = false;
    let ticketWithoutSession = null;

    let result;

    try {
      result = await withOptionalTransaction(async (session) => {
        const claimed = await Order.findOneAndUpdate(claimFilter, claimUpdate, { new: true, session });

        if (!claimed) return null;
        if (!session) claimedWithoutSession = true;

        const [ticket] = await Ticket.create(
          [
            {
              user: req.user._id,
              order: order._id,
              source: "delivery_feedback",
              subject: `Delivery issue — Order #${order._id.toString().slice(-8).toUpperCase()}`,
              messages: [{ sender: "customer", senderName: req.user.name, message }],
              lastMessageAt: now,
            },
          ],
          { session },
        );
        if (!session) ticketWithoutSession = ticket;

        const saved = await Order.findOneAndUpdate(
          { _id: order._id },
          { $set: { "deliveryFeedback.ticket": ticket._id } },
          { new: true, session },
        );

        return { saved, ticket };
      });
    } catch (error) {
      if (claimedWithoutSession) {
        if (ticketWithoutSession) await Ticket.deleteOne({ _id: ticketWithoutSession._id });

        await Order.updateOne(
          isCorrection
            ? { _id: order._id, "deliveryFeedback.correctedAt": now }
            : { _id: order._id, "deliveryFeedback.submittedAt": now },
          isCorrection
            ? {
                $set: { "deliveryFeedback.response": "yes", "deliveryFeedback.message": "" },
                $unset: { "deliveryFeedback.correctedAt": 1 },
                $pop: { "deliveryFeedback.history": 1 },
              }
            : { $unset: { deliveryFeedback: 1 } },
        );
      }

      throw error;
    }

    if (!result) return rejectUnavailable(res, { reason: "already_submitted" });

    notifyAdmin(result.ticket, result.ticket.messages[0]).catch(() => {});

    return res.status(201).json({
      success: true,
      deliveryFeedback: result.saved.deliveryFeedback,
      deliveryFeedbackInfo: getDeliveryFeedbackInfo(result.saved, now),
      ticketId: result.ticket._id,
    });
  } catch (error) {
    if (error instanceof TransactionsUnavailableError) {
      return reject(res, 503, "TEMPORARILY_UNAVAILABLE", "Couldn't save your feedback right now. Please try again shortly.");
    }

    // The database's one-ticket-per-order rule caught a duplicate.
    if (error.code === 11000) {
      return rejectUnavailable(res, { reason: "already_submitted" });
    }

    // No message text or personal details in the log — only the error.
    console.error("Submit Delivery Feedback Error:", error?.message || error);

    return reject(res, 500, "SERVER_ERROR", "Couldn't save your feedback. Please try again.");
  }
};
