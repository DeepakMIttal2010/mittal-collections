import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Question from "../models/Question.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// PR-2 (admin audit QS-01 + QS-02): product questions must not be a way to
// flood the admin inbox or Brevo's daily email quota.
//
// Everything is exercised over HTTP so this file needs nothing that the fix
// itself adds — except an optional hook to clear the in-memory rate-limit
// stores between tests (every supertest request comes from the same IP).
const resetLimiters = async () => {
  const mod = await import("../middleware/questionLimiter.js").catch(() => null);
  mod?.__resetQuestionLimitersForTests?.();
};

beforeEach(async () => {
  sendEmail.mockClear();
  sendEmail.mockResolvedValue({});
  await resetLimiters();
});

afterEach(() => {
  vi.useRealTimers();
});

const ask = (user, productId, question) =>
  request(app)
    .post("/api/questions")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send({ productId: String(productId), question });

const adminEmailCalls = () =>
  sendEmail.mock.calls.filter(([arg]) => /New product question/.test(arg?.subject || ""));

describe("PR-2: question input validation (QS-02)", () => {
  it.each([
    ["a number", 12345],
    ["an object", { $gt: "" }],
    ["an array", ["Is it cotton?"]],
  ])("rejects a question sent as %s with 400, not a server error", async (_label, value) => {
    const user = await createUser();
    const product = await createProduct();

    const res = await ask(user, product._id, value);

    expect(res.status).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it.each([
    ["empty", "   "],
    ["4 characters", "Size"],
    ["1001 characters", "a".repeat(1001)],
  ])("rejects a question that is %s", async (_label, text) => {
    const user = await createUser();
    const product = await createProduct();

    const res = await ask(user, product._id, text);

    expect(res.status).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it.each([
    ["5 characters", "Size?"],
    ["1000 characters", "b".repeat(1000)],
  ])("accepts a question of exactly %s and stores it trimmed", async (_label, text) => {
    const user = await createUser();
    const product = await createProduct();

    const res = await ask(user, product._id, `  ${text}  `);

    expect(res.status).toBe(201);
    expect((await Question.findOne()).question).toBe(text);
  });

  it("rejects a question about a product that doesn't exist", async () => {
    const user = await createUser();

    const res = await ask(user, "64b000000000000000000000", "Is this machine washable?");

    expect(res.status).toBe(404);
    expect(await Question.countDocuments()).toBe(0);
  });

  it.each([
    ["inactive", { isActive: false }],
    ["offline-only", { visibility: "offline" }],
  ])("rejects a question about an %s product", async (_label, overrides) => {
    const user = await createUser();
    const product = await createProduct(overrides);

    const res = await ask(user, product._id, "Is this machine washable?");

    expect(res.status).toBe(404);
    expect(await Question.countDocuments()).toBe(0);
  });
});

describe("PR-2: per-account limits (QS-01)", () => {
  it("allows 3 questions per account in 10 minutes, refuses the 4th, and doesn't affect another account", async () => {
    const user = await createUser();
    const other = await createUser();
    const product = await createProduct();

    for (let i = 1; i <= 3; i += 1) {
      expect((await ask(user, product._id, `Question number ${i}?`)).status).toBe(201);
    }
    const fourth = await ask(user, product._id, "Question number 4?");

    expect(fourth.status).toBe(429);
    expect((await ask(other, product._id, "A different customer asks")).status).toBe(201);
    expect(await Question.countDocuments({ user: user._id })).toBe(3);
  });

  it("refuses the 11th question of the same IST day for one account", async () => {
    const user = await createUser();
    const product = await createProduct();
    const now = Date.now();
    await Question.collection.insertMany(
      Array.from({ length: 10 }, (_, i) => ({
        product: product._id,
        user: user._id,
        question: `Earlier question ${i}`,
        answer: "",
        isPublished: false,
        isSeenByAdmin: false,
        createdAt: new Date(now - 60 * 1000),
        updatedAt: new Date(now - 60 * 1000),
      })),
    );

    const res = await ask(user, product._id, "One more question today?");

    expect(res.status).toBe(429);
    expect(await Question.countDocuments({ user: user._id })).toBe(10);
  });

  it("refuses the same question about the same product within 24 hours, but not a different one", async () => {
    const user = await createUser();
    const product = await createProduct();
    const otherProduct = await createProduct({ name: "Other product" });

    expect((await ask(user, product._id, "Is this machine washable?")).status).toBe(201);
    expect((await ask(user, product._id, "  Is this machine washable?  ")).status).toBe(409);
    expect((await ask(user, otherProduct._id, "Is this machine washable?")).status).toBe(201);
    expect(await Question.countDocuments({ user: user._id })).toBe(2);
  });
});

describe("PR-2: IST day boundary for the daily limit", () => {
  // 18:30:00.000Z is 00:00:00.000 IST on the next calendar day.
  const seedTen = async (user, product, createdAt) =>
    Question.collection.insertMany(
      Array.from({ length: 10 }, (_, i) => ({
        product: product._id,
        user: user._id,
        question: `Seeded question ${i}`,
        answer: "",
        isPublished: false,
        isSeenByAdmin: false,
        createdAt,
        updatedAt: createdAt,
      })),
    );

  const cases = [
    // [label, seeded at (UTC), now (UTC), expected status]
    ["10 asked at 23:59:59.999 IST yesterday, asking at 00:00:00.000 IST today", "2026-11-21T18:29:59.999Z", "2026-11-21T18:30:00.000Z", 201],
    ["10 asked at 00:00:00.000 IST today, asking moments later", "2026-11-21T18:30:00.000Z", "2026-11-21T18:30:00.500Z", 429],
    ["10 asked at 00:00 IST, asking at 23:59:59.999 IST the same day", "2026-11-20T18:30:00.000Z", "2026-11-21T18:29:59.999Z", 429],
    ["10 asked at 23:59:59.999 IST the day before, asking at 23:59:59.999 IST", "2026-11-20T18:29:59.999Z", "2026-11-21T18:29:59.999Z", 201],
  ];

  it.each(cases)("%s", async (_label, seededAt, now, expected) => {
    const user = await createUser();
    const product = await createProduct();
    await seedTen(user, product, new Date(seededAt));

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));

    const res = await ask(user, product._id, "Boundary question?");

    expect(res.status).toBe(expected);
  });
});

describe("PR-2: per-IP limit (separate from the shared email limiter)", () => {
  it("allows 10 questions a minute from one IP and refuses the 11th", async () => {
    const product = await createProduct();
    const users = await Promise.all(Array.from({ length: 11 }, () => createUser()));

    const statuses = [];
    for (const [i, user] of users.entries()) {
      statuses.push((await ask(user, product._id, `IP question ${i}?`)).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  });

  it("question traffic doesn't use up the shared limiter other routes rely on", async () => {
    const product = await createProduct();
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    for (const [i, user] of users.entries()) {
      expect((await ask(user, product._id, `Busy IP question ${i}?`)).status).toBe(201);
    }

    // The shared emailTriggerLimiter allows 15/min/IP. If questions counted
    // against it, these 10 + the 6 below would trip it on the 6th.
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (await request(app).post("/api/contact").send({
          name: "Visitor",
          email: `visitor${i}@example.com`,
          subject: "Hello",
          message: "Just checking the contact form.",
        })).status,
      );
    }
    expect(statuses).not.toContain(429);
  });
});

describe("PR-2: admin email budget for questions (max 20 per IST day)", () => {
  it("emails the admin for the first 20 questions of the day only, even when they arrive at once", async () => {
    await seedSiteSettings({ email: "owner@example.com" });
    const product = await createProduct();
    const users = await Promise.all(Array.from({ length: 25 }, () => createUser()));

    // Concurrent, and the very first ones race to create the day's budget.
    // Sent in batches below the per-IP limit, limiters cleared in between.
    const results = [];
    for (let start = 0; start < users.length; start += 5) {
      await resetLimiters();
      const batch = users.slice(start, start + 5);
      results.push(
        ...(await Promise.all(batch.map((user, i) => ask(user, product._id, `Concurrent question ${start + i}?`)))),
      );
    }

    expect(results.map((r) => r.status)).toEqual(Array(25).fill(201));
    expect(await Question.countDocuments()).toBe(25);
    await vi.waitFor(() => expect(adminEmailCalls().length).toBe(20), { timeout: 5000 });
    // Give any stray (over-budget) email a chance to show up before asserting.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(adminEmailCalls().length).toBe(20);
  });

  it("a failed admin email still saves the question and returns success", async () => {
    await seedSiteSettings({ email: "owner@example.com" });
    sendEmail.mockRejectedValue(new Error("Brevo down"));
    const user = await createUser();
    const product = await createProduct();

    const res = await ask(user, product._id, "Will this survive an email outage?");

    expect(res.status).toBe(201);
    expect(await Question.countDocuments()).toBe(1);
    await vi.waitFor(() => expect(adminEmailCalls().length).toBe(1));
  });
});

describe("PR-2: reserveNotificationSlot (atomic daily counter)", () => {
  it("hands out exactly `limit` slots to 50 simultaneous first-of-the-day callers", async () => {
    const { reserveNotificationSlot } = await import("../utils/notificationBudget.js");
    const NotificationBudget = (await import("../models/NotificationBudget.js")).default;
    await NotificationBudget.init(); // indexes in place, like on a running server

    const now = new Date("2026-11-21T10:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 50 }, () => reserveNotificationSlot("race-test", 20, now)),
    );

    expect(results.filter(Boolean)).toHaveLength(20);
    const doc = await NotificationBudget.findById("race-test:2026-11-21").lean();
    expect(doc.count).toBe(20);
  });

  it("refuses once the day's budget is spent, and starts again on the next IST day", async () => {
    const { reserveNotificationSlot } = await import("../utils/notificationBudget.js");
    const lastMoment = new Date("2026-11-21T18:29:59.999Z"); // 23:59:59.999 IST, 21 Nov
    const nextDay = new Date("2026-11-21T18:30:00.000Z"); // 00:00 IST, 22 Nov

    for (let i = 0; i < 2; i += 1) expect(await reserveNotificationSlot("day-test", 2, lastMoment)).toBe(true);
    expect(await reserveNotificationSlot("day-test", 2, lastMoment)).toBe(false);
    expect(await reserveNotificationSlot("day-test", 2, nextDay)).toBe(true);
  });
});

describe("PR-2: reserveNotificationSlot duplicate-key handling (forced)", () => {
  // A real first-of-the-day creation race isn't reliably reproducible
  // against an in-memory mongod, so the losing side of it is forced here:
  // the first upsert fails with E11000 as if another request had just
  // created the day's document.
  const loseCreationRaceOnce = async (NotificationBudget) => {
    const original = NotificationBudget.findOneAndUpdate.bind(NotificationBudget);
    let thrown = false;
    return vi.spyOn(NotificationBudget, "findOneAndUpdate").mockImplementation((...args) => {
      if (!thrown) {
        thrown = true;
        const error = new Error("E11000 duplicate key error");
        error.code = 11000;
        return Promise.reject(error);
      }
      return original(...args);
    });
  };

  it("retries after losing the creation race and takes a slot from the winner's document", async () => {
    const { reserveNotificationSlot } = await import("../utils/notificationBudget.js");
    const NotificationBudget = (await import("../models/NotificationBudget.js")).default;
    const now = new Date("2026-11-21T10:00:00.000Z");
    await NotificationBudget.create({ _id: "retry-test:2026-11-21", count: 1, expiresAt: new Date(now.getTime() + 1e9) });
    const spy = await loseCreationRaceOnce(NotificationBudget);

    expect(await reserveNotificationSlot("retry-test", 20, now)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await NotificationBudget.findById("retry-test:2026-11-21").lean()).count).toBe(2);
    spy.mockRestore();
  });

  it("treats a duplicate-key error on a spent budget as 'no slot' without retrying", async () => {
    const { reserveNotificationSlot } = await import("../utils/notificationBudget.js");
    const NotificationBudget = (await import("../models/NotificationBudget.js")).default;
    const now = new Date("2026-11-21T10:00:00.000Z");
    await NotificationBudget.create({ _id: "spent-test:2026-11-21", count: 20, expiresAt: new Date(now.getTime() + 1e9) });
    const spy = await loseCreationRaceOnce(NotificationBudget);

    expect(await reserveNotificationSlot("spent-test", 20, now)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await NotificationBudget.findById("spent-test:2026-11-21").lean()).count).toBe(20);
    spy.mockRestore();
  });
});
