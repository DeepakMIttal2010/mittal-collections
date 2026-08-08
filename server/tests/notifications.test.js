import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Notification from "../models/Notification.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

describe("Notification de-duplication", () => {
  it("creates exactly one notification per order status change, not zero or more than one", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);
    const product = await createProduct({ price: 1000, stock: 5 });

    const placeRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderItems: [
          {
            product: product._id.toString(),
            name: product.name,
            image: product.image,
            price: product.price,
            quantity: 1,
          },
        ],
        shippingAddress,
        paymentMethod: "COD",
      });
    const orderId = placeRes.body.order._id;

    await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Processing" });
    // notifyUser() is fire-and-forget (not awaited by the request
    // handler) so it can complete after the HTTP response returns.
    await new Promise((r) => setTimeout(r, 200));

    let notifications = await Notification.find({
      user: user._id,
      type: "order_status",
    });
    expect(notifications).toHaveLength(1);

    // A second, different status change must add a second notification —
    // not skip it (already-notified bug) and not duplicate the first.
    await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Shipped" });
    await new Promise((r) => setTimeout(r, 200));

    notifications = await Notification.find({
      user: user._id,
      type: "order_status",
    });
    expect(notifications).toHaveLength(2);
  });

  it("notifies the customer exactly once per admin ticket reply, and not at all for their own reply", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const token = signToken(user);
    const adminToken = signToken(admin);

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Help", message: "I have a question" });
    const ticketId = createRes.body.ticket._id;

    // Creating the ticket is the customer's own action — no self-notification.
    let notifications = await Notification.find({
      user: user._id,
      type: "ticket_reply",
    });
    expect(notifications).toHaveLength(0);

    await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ message: "Here's the answer" });
    await new Promise((r) => setTimeout(r, 200));

    notifications = await Notification.find({
      user: user._id,
      type: "ticket_reply",
    });
    expect(notifications).toHaveLength(1);

    // The customer replying to their own ticket must not notify themself.
    await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Thanks, one more question though" });
    await new Promise((r) => setTimeout(r, 200));

    notifications = await Notification.find({
      user: user._id,
      type: "ticket_reply",
    });
    expect(notifications).toHaveLength(1); // unchanged
  });

  it("marking one notification read doesn't affect others, and mark-all-read clears the rest", async () => {
    const user = await createUser();
    const token = signToken(user);

    await Notification.create([
      { user: user._id, type: "order_status", title: "A" },
      { user: user._id, type: "order_status", title: "B" },
      { user: user._id, type: "loyalty_points", title: "C" },
    ]);

    const all = await Notification.find({ user: user._id });
    const [first] = all;

    await request(app)
      .put(`/api/notifications/${first._id}/read`)
      .set("Authorization", `Bearer ${token}`);

    let unread = await Notification.countDocuments({
      user: user._id,
      isRead: false,
    });
    expect(unread).toBe(2);

    await request(app)
      .put("/api/notifications/mark-all-read")
      .set("Authorization", `Bearer ${token}`);

    unread = await Notification.countDocuments({
      user: user._id,
      isRead: false,
    });
    expect(unread).toBe(0);
  });

  it("cannot mark another user's notification as read", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const intruderToken = signToken(intruder);

    const notification = await Notification.create({
      user: owner._id,
      type: "order_status",
      title: "Private",
    });

    const res = await request(app)
      .put(`/api/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${intruderToken}`);

    expect(res.status).toBe(404);

    const stillUnread = await Notification.findById(notification._id);
    expect(stillUnread.isRead).toBe(false);
  });
});
