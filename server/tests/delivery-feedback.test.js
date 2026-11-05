import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// Some cases post well over emailTriggerLimiter's 15-per-minute budget,
// which reads DISABLE_AUTH_RATE_LIMIT at module load. vi.hoisted runs
// before every import below, so the flag is set before app.js builds its
// limiters — and app.js loads as a normal import, outside any hook's
// timeout (a dynamic import inside beforeAll could exceed it on a slow
// machine and skip the whole file). Never set in production.
const { sendEmail } = vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Ticket from "../models/Ticket.js";
import Review from "../models/Review.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d) => new Date(Date.now() - d * DAY);
const VALID_ISSUE = "The bedsheet arrived torn at one corner.";

// A delivered order the way updateOrderStatus actually leaves one.
const deliveredOrder = async (user, overrides = {}, deliveredDaysAgo = 2) => {
  const product = await createProduct();
  return createOrder({
    user,
    products: [product],
    overrides: {
      orderStatus: "Delivered",
      deliveredAt: daysAgo(deliveredDaysAgo),
      statusHistory: [
        { status: "Pending", changedAt: daysAgo(deliveredDaysAgo + 3) },
        { status: "Delivered", changedAt: daysAgo(deliveredDaysAgo) },
      ],
      ...overrides,
    },
  });
};

const feedback = (user, orderId, body) =>
  request(app)
    .post(`/api/orders/${orderId}/delivery-feedback`)
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send(body);

describe("Delivery feedback — eligibility", () => {
  it("1. accepts a delivered prepaid order", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, { paymentMethod: "Razorpay", isPaid: true });

    const res = await feedback(user, order._id, { response: "yes" });

    expect(res.status).toBe(201);
    expect(res.body.deliveryFeedback.response).toBe("yes");
  });

  it("2. accepts a delivered COD order with isPaid=false", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, { paymentMethod: "COD", isPaid: false });

    const res = await feedback(user, order._id, { response: "yes" });

    expect(res.status).toBe(201);
  });

  it.each(["Pending", "Processing", "Shipped"])("3. rejects a %s (not delivered) order", async (status) => {
    const user = await createUser();
    const order = await deliveredOrder(user, {
      orderStatus: status,
      deliveredAt: undefined,
      statusHistory: [{ status: "Pending", changedAt: daysAgo(2) }],
    });

    const res = await feedback(user, order._id, { response: "yes" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NOT_DELIVERED");
  });

  it("4. treats another customer's order as not found, and changes nothing", async () => {
    const owner = await createUser();
    const other = await createUser();
    const order = await deliveredOrder(owner);

    const res = await feedback(other, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(404);
    expect((await Order.findById(order._id)).deliveryFeedback).toBeUndefined();
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("5. accepts an order cancelled after a recorded delivery", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, { orderStatus: "Cancelled" });

    const res = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(201);
  });

  it("6. rejects an RTO / cancelled-before-delivery order", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, {
      orderStatus: "Cancelled",
      deliveredAt: undefined,
      statusHistory: [
        { status: "Pending", changedAt: daysAgo(6) },
        { status: "Shipped", changedAt: daysAgo(5) },
        { status: "Cancelled", changedAt: daysAgo(1) },
      ],
    });

    const res = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(403);
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("7. rejects feedback after the 30-day window, and accepts it on day 29", async () => {
    const user = await createUser();
    const late = await deliveredOrder(user, {}, 31);
    const inTime = await deliveredOrder(user, {}, 29);

    const lateRes = await feedback(user, late._id, { response: "yes" });
    expect(lateRes.status).toBe(403);
    expect(lateRes.body.code).toBe("FEEDBACK_WINDOW_CLOSED");

    expect((await feedback(user, inTime._id, { response: "yes" })).status).toBe(201);
  });

  it("8. uses the Delivered history date when deliveredAt is missing, and never guesses when there is no date", async () => {
    const user = await createUser();
    const historyOnly = await deliveredOrder(user, { deliveredAt: undefined });
    const historyTooOld = await deliveredOrder(user, {
      deliveredAt: undefined,
      statusHistory: [{ status: "Delivered", changedAt: daysAgo(40) }],
    });
    const noDateAtAll = await deliveredOrder(user, { deliveredAt: undefined, statusHistory: [] });

    expect((await feedback(user, historyOnly._id, { response: "yes" })).status).toBe(201);
    expect((await feedback(user, historyTooOld._id, { response: "yes" })).body.code).toBe("FEEDBACK_WINDOW_CLOSED");

    const noDate = await feedback(user, noDateAtAll._id, { response: "yes" });
    expect(noDate.status).toBe(403);
    expect(noDate.body.code).toBe("NOT_DELIVERED");
  });

  it("rejects a soft-deleted order and a logged-out request", async () => {
    const user = await createUser();
    const deleted = await deliveredOrder(user, { orderStatus: "Cancelled", isActive: false });

    expect((await feedback(user, deleted._id, { response: "yes" })).status).toBe(403);

    const anonymous = await request(app)
      .post(`/api/orders/${deleted._id}/delivery-feedback`)
      .send({ response: "yes" });
    expect(anonymous.status).toBe(401);
  });
});

describe("Delivery feedback — answers", () => {
  it("9. saves a Yes with its timestamp and history, and opens no ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "yes" });

    const saved = (await Order.findById(order._id)).deliveryFeedback;
    expect(saved.response).toBe("yes");
    expect(saved.submittedAt).toBeInstanceOf(Date);
    expect(saved.history).toHaveLength(1);
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("10. saves a No with a trimmed description and links its ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    const res = await feedback(user, order._id, { response: "no", message: `   ${VALID_ISSUE}   ` });

    expect(res.status).toBe(201);
    const saved = (await Order.findById(order._id)).deliveryFeedback;
    expect(saved.response).toBe("no");
    expect(saved.message).toBe(VALID_ISSUE);
    expect(String(saved.ticket)).toBe(String(res.body.ticketId));
  });

  it.each([
    ["missing", undefined],
    ["9 characters", "123456789"],
    ["only spaces", "            "],
    ["1001 characters", "a".repeat(1001)],
    ["not text", { $gt: "" }],
  ])("11-13. rejects No with a description that is %s", async (_label, message) => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    const res = await feedback(user, order._id, { response: "no", message });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_MESSAGE");
    expect((await Order.findById(order._id)).deliveryFeedback).toBeUndefined();
  });

  it("accepts exactly 10 and exactly 1000 characters", async () => {
    const user = await createUser();
    const a = await deliveredOrder(user);
    const b = await deliveredOrder(user);

    expect((await feedback(user, a._id, { response: "no", message: "a".repeat(10) })).status).toBe(201);
    expect((await feedback(user, b._id, { response: "no", message: "b".repeat(1000) })).status).toBe(201);
  });

  it("rejects an answer that isn't yes/no", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    expect((await feedback(user, order._id, { response: "maybe" })).status).toBe(400);
    expect((await feedback(user, order._id, { response: ["yes"] })).status).toBe(400);
  });

  it("rejects a second Yes", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "yes" });
    const again = await feedback(user, order._id, { response: "yes" });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_SUBMITTED");
  });

  it("14 + 17. allows Yes -> No once within 30 days, keeping the original in the history", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "yes" });
    const res = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(201);
    const saved = (await Order.findById(order._id)).deliveryFeedback;
    expect(saved.response).toBe("no");
    expect(saved.correctedAt).toBeInstanceOf(Date);
    expect(saved.history.map((h) => h.response)).toEqual(["yes", "no"]);
    expect(saved.history[0].submittedAt.getTime()).toBe(saved.submittedAt.getTime());
    expect(await Ticket.countDocuments({ order: order._id, source: "delivery_feedback" })).toBe(1);
  });

  it("15. rejects a second correction", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "yes" });
    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });
    const again = await feedback(user, order._id, { response: "no", message: "Another problem entirely." });

    expect(again.status).toBe(409);
    expect(await Ticket.countDocuments()).toBe(1);
  });

  it("16. rejects No -> Yes", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });
    const res = await feedback(user, order._id, { response: "yes" });

    expect(res.status).toBe(409);
    expect((await Order.findById(order._id)).deliveryFeedback.response).toBe("no");
  });

  it("rejects a Yes -> No correction after the 30-day window", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, {}, 31);
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          deliveryFeedback: {
            response: "yes",
            submittedAt: daysAgo(30),
            history: [{ response: "yes", submittedAt: daysAgo(30) }],
          },
        },
      },
    );

    const res = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEEDBACK_WINDOW_CLOSED");
  });
});

describe("Delivery feedback — tickets", () => {
  it("18. one No opens exactly one ticket, marked as delivery feedback, and alerts the admin", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const tickets = await Ticket.find();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].source).toBe("delivery_feedback");
    expect(String(tickets[0].user)).toBe(String(user._id));
    expect(String(tickets[0].order)).toBe(String(order._id));
    expect(tickets[0].status).toBe("Open");
    expect(tickets[0].messages[0].message).toBe(VALID_ISSUE);
  });

  it("19. a repeated No opens no second ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });
    const again = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(again.status).toBe(409);
    expect(await Ticket.countDocuments()).toBe(1);
  });

  it("20. simultaneous No requests open exactly one ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => feedback(user, order._id, { response: "no", message: VALID_ISSUE })),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await Ticket.countDocuments()).toBe(1);
  });

  it("simultaneous Yes -> No corrections open exactly one ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "yes" });

    const results = await Promise.all(
      [1, 2, 3].map(() => feedback(user, order._id, { response: "no", message: VALID_ISSUE })),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Ticket.countDocuments()).toBe(1);
    expect((await Order.findById(order._id)).deliveryFeedback.history).toHaveLength(2);
  });

  it("the database refuses a second delivery-feedback ticket for the same order", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    const base = {
      user: user._id,
      order: order._id,
      source: "delivery_feedback",
      subject: "x",
      messages: [{ sender: "customer", senderName: "x", message: "x" }],
    };

    await Ticket.create(base);
    await expect(Ticket.create(base)).rejects.toMatchObject({ code: 11000 });

    // Ordinary customer tickets on the same order are unaffected.
    await Ticket.create({ ...base, source: "customer" });
    await Ticket.create({ ...base, source: "customer" });
    expect(await Ticket.countDocuments({ order: order._id })).toBe(3);
  });

  it("21 + 22. a ticket failure saves nothing, and a retry succeeds with one ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    vi.spyOn(Ticket, "create").mockRejectedValueOnce(new Error("ticket store down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(failed.status).toBe(500);
    expect((await Order.findById(order._id)).deliveryFeedback).toBeUndefined();
    expect(await Ticket.countDocuments()).toBe(0);

    const retry = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(retry.status).toBe(201);
    expect(await Ticket.countDocuments()).toBe(1);
    expect((await Order.findById(order._id)).deliveryFeedback.ticket).toBeTruthy();
  });

  it("a ticket failure during a correction keeps the original Yes, and the retry works", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "yes" });
    vi.spyOn(Ticket, "create").mockRejectedValueOnce(new Error("ticket store down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await feedback(user, order._id, { response: "no", message: VALID_ISSUE })).status).toBe(500);

    const kept = (await Order.findById(order._id)).deliveryFeedback;
    expect(kept.response).toBe("yes");
    expect(kept.correctedAt).toBeUndefined();
    expect(kept.history).toHaveLength(1);

    expect((await feedback(user, order._id, { response: "no", message: VALID_ISSUE })).status).toBe(201);
    expect(await Ticket.countDocuments()).toBe(1);
  });

  it("never writes the customer's description to the error log", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    vi.spyOn(Ticket, "create").mockRejectedValueOnce(new Error("ticket store down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(JSON.stringify(logged.mock.calls)).not.toContain(VALID_ISSUE);
  });
});

describe("Delivery feedback — visibility", () => {
  it("the order page gets what the customer may still do", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    const get = () => request(app).get(`/api/orders/${order._id}`).set("Authorization", `Bearer ${signToken(user)}`);

    let res = await get();
    expect(res.body.deliveryFeedbackInfo).toMatchObject({ eligible: true, canSubmit: true, canReportIssue: true });

    await feedback(user, order._id, { response: "yes" });
    res = await get();
    expect(res.body.order.deliveryFeedback.response).toBe("yes");
    expect(res.body.deliveryFeedbackInfo).toMatchObject({ canSubmit: false, canReportIssue: true });

    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });
    res = await get();
    expect(res.body.deliveryFeedbackInfo).toMatchObject({ canSubmit: false, canReportIssue: false, reason: "already_submitted" });
  });

  it("another customer can't read the feedback through the order or its ticket", async () => {
    const owner = await createUser();
    const other = await createUser();
    const order = await deliveredOrder(owner);
    const { body } = await feedback(owner, order._id, { response: "no", message: VALID_ISSUE });

    const asOther = (path) => request(app).get(path).set("Authorization", `Bearer ${signToken(other)}`);

    expect((await asOther(`/api/orders/${order._id}`)).status).toBe(403);
    expect((await asOther(`/api/tickets/${body.ticketId}`)).status).toBe(403);
  });

  it("the ticket shows its source and the order's feedback history to the owner", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "yes" });
    const { body } = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const res = await request(app)
      .get(`/api/tickets/${body.ticketId}`)
      .set("Authorization", `Bearer ${signToken(user)}`);

    expect(res.body.ticket.source).toBe("delivery_feedback");
    expect(res.body.ticket.order.deliveryFeedback.history.map((h) => h.response)).toEqual(["yes", "no"]);
  });

  it("feedback never appears in the public product review responses", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const res = await request(app).get(`/api/reviews/product/${order.orderItems[0].product}`);

    expect(JSON.stringify(res.body)).not.toContain(VALID_ISSUE);
  });
});

describe("Delivery feedback — regression", () => {
  it("23. customer-created tickets still work and are marked as customer tickets", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const res = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ subject: "Size question", message: "Can I exchange for king size?", order: String(order._id), source: "delivery_feedback" });

    expect(res.status).toBe(201);
    // A customer can't pass their own ticket off as delivery feedback.
    expect(res.body.ticket.source).toBe("customer");
    expect(await Ticket.countDocuments({ order: order._id })).toBe(2);
  });

  it("24 + 25. an open complaint doesn't block an honest review, and gives or takes no loyalty points", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);
    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const review = await request(app)
      .post("/api/reviews")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ productId: String(order.orderItems[0].product), rating: 2, content: "Arrived torn." });

    expect(review.status).toBe(201);
    expect(await Review.countDocuments()).toBe(1);
    expect(await LoyaltyTransaction.countDocuments()).toBe(0);
  });

  it("26. feedback leaves the order's status, payment and loyalty fields untouched", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user, { paymentMethod: "COD", isPaid: false, pointsEarned: 20 });
    const before = (await Order.findById(order._id)).toObject();

    await feedback(user, order._id, { response: "yes" });
    await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    const after = (await Order.findById(order._id)).toObject();
    for (const field of ["orderStatus", "isPaid", "paymentMethod", "totalPrice", "pointsEarned", "deliveredAt", "statusHistory"]) {
      expect(after[field]).toEqual(before[field]);
    }
  });
});
