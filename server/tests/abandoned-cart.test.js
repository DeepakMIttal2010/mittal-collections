import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import CartSnapshot from "../models/CartSnapshot.js";
import { createUser, createProduct } from "./helpers.js";

const REMINDER_DELAY_HOURS = 3; // must match cartController.js

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

const callReminders = (secret = process.env.CRON_SECRET) =>
  request(app).post(
    `/api/cart/send-abandoned-reminders${secret ? `?secret=${secret}` : ""}`,
  );

describe("POST /api/cart/send-abandoned-reminders", () => {
  it("rejects a request without the correct secret", async () => {
    const res = await callReminders("wrong-secret");

    expect(res.status).toBe(401);
  });

  it("only targets carts that are past the delay and haven't been reminded yet", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const cartItem = {
      product: product._id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity: 1,
    };

    const staleUser = await createUser();
    const staleCart = await CartSnapshot.create({
      user: staleUser._id,
      items: [cartItem],
    });
    // Backdate past the reminder delay — findByIdAndUpdate bypasses the
    // schema's auto-managed updatedAt so this sticks.
    await CartSnapshot.collection.updateOne(
      { _id: staleCart._id },
      { $set: { updatedAt: hoursAgo(REMINDER_DELAY_HOURS + 1) } },
    );

    const freshUser = await createUser();
    await CartSnapshot.create({
      user: freshUser._id,
      items: [cartItem],
    }); // updatedAt defaults to "now" — well within the delay window

    const alreadyRemindedUser = await createUser();
    const alreadyReminded = await CartSnapshot.create({
      user: alreadyRemindedUser._id,
      items: [cartItem],
      reminderSentAt: new Date(),
    });
    await CartSnapshot.collection.updateOne(
      { _id: alreadyReminded._id },
      { $set: { updatedAt: hoursAgo(REMINDER_DELAY_HOURS + 1) } },
    );

    const res = await callReminders();

    expect(res.status).toBe(200);
    // Only the stale, never-reminded cart should have matched — the
    // fresh one is too recent, the already-reminded one is excluded by
    // reminderSentAt: null in the query.
    expect(res.body.total).toBe(1);
  });

  it("does not re-target a cart on a second run once a reminder has been recorded", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const user = await createUser();
    const cart = await CartSnapshot.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 1,
        },
      ],
    });
    await CartSnapshot.collection.updateOne(
      { _id: cart._id },
      { $set: { updatedAt: hoursAgo(REMINDER_DELAY_HOURS + 1) } },
    );

    // Simulate a reminder having already been sent (independent of
    // whether the outbound email itself succeeds in this environment).
    await CartSnapshot.findByIdAndUpdate(cart._id, {
      reminderSentAt: new Date(),
    });

    const res = await callReminders();

    expect(res.body.total).toBe(0);
  });
});
