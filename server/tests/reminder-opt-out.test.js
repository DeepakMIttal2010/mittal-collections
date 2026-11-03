import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import User from "../models/User.js";
import CartSnapshot from "../models/CartSnapshot.js";
import Wishlist from "../models/Wishlist.js";
import Subscriber from "../models/Subscriber.js";
import { createUnsubscribeToken } from "../utils/unsubscribeToken.js";
import { createUser, createProduct } from "./helpers.js";

const LINK = /\/reminders\/unsubscribe\?t=([a-f0-9]{48})"/;
const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
const cron = (path) => request(app).post(`${path}?secret=${process.env.CRON_SECRET}`);
const optOut = (token) => request(app).post("/api/reminder-emails/opt-out").send({ token });
const emailsTo = (email) => sendEmail.mock.calls.map(([arg]) => arg).filter((m) => m.to === email);
const storedToken = async (userId) =>
  (await User.findById(userId).select("+reminderOptOutToken").lean()).reminderOptOutToken;

const staleCart = async (user) => {
  const product = await createProduct({ price: 500, stock: 5 });
  const cart = await CartSnapshot.create({
    user: user._id,
    items: [{ product: product._id, name: product.name, image: product.image, price: 500, quantity: 1 }],
  });
  await CartSnapshot.collection.updateOne({ _id: cart._id }, { $set: { updatedAt: hoursAgo(4) } });
  return cart;
};

const droppedWishlistItem = async (user) => {
  const product = await createProduct({ price: 800 });
  return Wishlist.create({ user: user._id, product: product._id, priceWhenAdded: 1000 });
};

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

describe("reminder emails: unsubscribe link", () => {
  it("cart reminder and price-drop emails carry the same token link, and it is stable", async () => {
    const user = await createUser();
    await staleCart(user);
    await droppedWishlistItem(user);

    await cron("/api/cart/send-abandoned-reminders");
    await cron("/api/wishlist/send-price-drop-alerts");

    const [cartMail, dropMail] = emailsTo(user.email);
    const token = await storedToken(user._id);
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    for (const mail of [cartMail, dropMail]) {
      expect(mail.html.match(LINK)?.[1]).toBe(token);
      expect(mail.html).toContain("This does not change your newsletter subscription.");
      // No email address or user id in the link.
      expect(mail.html).not.toContain(`t=${user._id}`);
      expect(mail.html.match(/reminders\/unsubscribe[^"]*/)[0]).not.toContain(user.email);
    }
  });

  it("the token is never returned by ordinary user queries", async () => {
    const user = await createUser();
    await staleCart(user);
    await cron("/api/cart/send-abandoned-reminders");

    const plain = await User.findById(user._id).lean();
    expect(plain.reminderOptOutToken).toBeUndefined();
    expect(plain.reminderEmailsOptOut).toBe(false);
  });
});

describe("POST /api/reminder-emails/opt-out", () => {
  const userWithToken = async () => {
    const user = await createUser();
    await staleCart(user);
    await cron("/api/cart/send-abandoned-reminders");
    return { user, token: await storedToken(user._id) };
  };

  it("opts the account out with a valid token, without login, and is idempotent", async () => {
    const { user, token } = await userWithToken();

    const first = await optOut(token);
    expect(first.status).toBe(200);
    expect((await User.findById(user._id)).reminderEmailsOptOut).toBe(true);

    const again = await optOut(token);
    expect(again.status).toBe(200);
    expect((await User.findById(user._id)).reminderEmailsOptOut).toBe(true);
  });

  it("rejects malformed, unknown and newsletter tokens without changing anything", async () => {
    const { user } = await userWithToken();

    for (const bad of [undefined, "", "abc", { $ne: null }, "f".repeat(48), createUnsubscribeToken(user.email)]) {
      const res = await optOut(bad);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
    expect((await User.findById(user._id)).reminderEmailsOptOut).toBe(false);
  });

  it("a reminder token cannot unsubscribe the newsletter", async () => {
    const { user, token } = await userWithToken();
    await Subscriber.create({ email: user.email });

    const res = await request(app).post("/api/newsletter/unsubscribe").send({ email: user.email, token });
    expect(res.status).toBe(400);
    expect(await Subscriber.findOne({ email: user.email })).not.toBeNull();

    // And opting out of reminders leaves the newsletter alone.
    await optOut(token);
    expect(await Subscriber.findOne({ email: user.email })).not.toBeNull();
  });
});

describe("cron endpoints skip opted-out users", () => {
  it("no cart reminder or price-drop email for an opted-out user; others still get theirs", async () => {
    const optedOut = await createUser({ reminderEmailsOptOut: true });
    const normal = await createUser();
    for (const u of [optedOut, normal]) {
      await staleCart(u);
      await droppedWishlistItem(u);
    }

    await cron("/api/cart/send-abandoned-reminders");
    await cron("/api/wishlist/send-price-drop-alerts");

    expect(emailsTo(optedOut.email)).toHaveLength(0);
    expect(emailsTo(normal.email).map((m) => m.subject)).toEqual([
      "You left something in your cart",
      expect.stringMatching(/^Price drop:/),
    ]);
  });

  it("still skips them after the cart or wishlist changes", async () => {
    const optedOut = await createUser({ reminderEmailsOptOut: true });
    await staleCart(optedOut);
    await cron("/api/cart/send-abandoned-reminders");

    // A new change re-arms an ordinary cart; an opted-out one stays silent.
    await CartSnapshot.updateOne({ user: optedOut._id }, { $set: { reminderSentAt: null } });
    await CartSnapshot.collection.updateOne({ user: optedOut._id }, { $set: { updatedAt: hoursAgo(5) } });
    await droppedWishlistItem(optedOut);
    await cron("/api/cart/send-abandoned-reminders");
    await cron("/api/wishlist/send-price-drop-alerts");

    expect(emailsTo(optedOut.email)).toHaveLength(0);
  });
});
