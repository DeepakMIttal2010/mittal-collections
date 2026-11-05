import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// A real (single-member) replica set, so the "No" answer and its ticket go
// through an actual MongoDB transaction — the way production (Atlas) runs.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Ticket from "../models/Ticket.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const VALID_ISSUE = "Two curtain rings were missing from the pack.";

const deliveredOrder = async (user) => {
  const product = await createProduct();
  return createOrder({
    user,
    products: [product],
    overrides: {
      orderStatus: "Delivered",
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      statusHistory: [{ status: "Delivered", changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }],
    },
  });
};

const feedback = (user, orderId, body) =>
  request(app)
    .post(`/api/orders/${orderId}/delivery-feedback`)
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send(body);

describe("Delivery feedback inside a MongoDB transaction", () => {
  it("saves the answer and its ticket together", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    const res = await feedback(user, order._id, { response: "no", message: VALID_ISSUE });

    expect(res.status).toBe(201);
    const ticket = await Ticket.findOne({ order: order._id });
    expect(ticket.source).toBe("delivery_feedback");
    expect(String((await Order.findById(order._id)).deliveryFeedback.ticket)).toBe(String(ticket._id));
  });

  it("rolls the answer back when the ticket can't be created, and a retry succeeds", async () => {
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
  });

  it("rolls a Yes -> No correction back to the original Yes when the ticket fails", async () => {
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
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("simultaneous No requests still open exactly one ticket", async () => {
    const user = await createUser();
    const order = await deliveredOrder(user);

    const results = await Promise.all(
      [1, 2, 3].map(() => feedback(user, order._id, { response: "no", message: VALID_ISSUE })),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Ticket.countDocuments()).toBe(1);
  });
});
