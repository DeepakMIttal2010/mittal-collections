import { describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "crypto";

// No email is sent by this route itself, but app.js wires up the whole
// newsletter router (including sendCampaign/subscribe), so this mock is
// cheap insurance against an accidental real-Brevo call hanging/failing
// the suite -- same convention as back-in-stock.test.js.
import { vi } from "vitest";
vi.mock("../config/mailer.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import "./setup.js";
import app from "../app.js";
import Subscriber from "../models/Subscriber.js";
import { createUnsubscribeToken } from "../utils/unsubscribeToken.js";

const unsubscribe = (body) => request(app).post("/api/newsletter/unsubscribe").send(body);

describe("Newsletter unsubscribe", () => {
  it("removes the subscriber with a valid token + matching email", async () => {
    await Subscriber.create({ email: "shopper@example.com" });

    const res = await unsubscribe({
      email: "shopper@example.com",
      token: createUnsubscribeToken("shopper@example.com"),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "You've been unsubscribed" });
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).toBeNull();
  });

  it("accepts an email submitted with different case/whitespace than it was sent to", async () => {
    await Subscriber.create({ email: "shopper@example.com" });

    const res = await unsubscribe({
      email: "  Shopper@Example.com  ",
      token: createUnsubscribeToken("shopper@example.com"),
    });

    expect(res.status).toBe(200);
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).toBeNull();
  });

  it("rejects a tampered token and leaves the subscriber in place", async () => {
    await Subscriber.create({ email: "shopper@example.com" });
    const token = createUnsubscribeToken("shopper@example.com");
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");

    const res = await unsubscribe({ email: "shopper@example.com", token: tampered });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).not.toBeNull();
  });

  it("rejects a token that was issued for a different email", async () => {
    await Subscriber.create({ email: "shopper@example.com" });

    const res = await unsubscribe({
      email: "shopper@example.com",
      token: createUnsubscribeToken("someone-else@example.com"),
    });

    expect(res.status).toBe(400);
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).not.toBeNull();
  });

  it("returns 400 (not 500) when token is missing entirely", async () => {
    const res = await unsubscribe({ email: "shopper@example.com" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing entirely", async () => {
    const res = await unsubscribe({ token: "whatever" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-string email without touching the DB", async () => {
    await Subscriber.create({ email: "shopper@example.com" });

    const res = await unsubscribe({ email: { $ne: null }, token: "whatever" });

    expect(res.status).toBe(400);
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).not.toBeNull();
  });

  it("returns 200 even when no matching subscriber exists (no email-enumeration signal)", async () => {
    const res = await unsubscribe({
      email: "never-subscribed@example.com",
      token: createUnsubscribeToken("never-subscribed@example.com"),
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("You've been unsubscribed");
  });

  it("is idempotent -- unsubscribing twice in a row both return 200", async () => {
    await Subscriber.create({ email: "shopper@example.com" });
    const token = createUnsubscribeToken("shopper@example.com");

    const first = await unsubscribe({ email: "shopper@example.com", token });
    const second = await unsubscribe({ email: "shopper@example.com", token });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("rejects a token signed with a different secret (e.g. pre-rotation)", async () => {
    await Subscriber.create({ email: "shopper@example.com" });
    const wrongSecretToken = crypto
      .createHmac("sha256", "a-different-secret")
      .update("shopper@example.com")
      .digest("hex");

    const res = await unsubscribe({ email: "shopper@example.com", token: wrongSecretToken });

    expect(res.status).toBe(400);
    expect(await Subscriber.findOne({ email: "shopper@example.com" })).not.toBeNull();
  });
});
