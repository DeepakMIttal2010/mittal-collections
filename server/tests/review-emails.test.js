import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => {
  // The cron endpoint is hit many times here; keep the general limiter out of the way.
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, createProduct, createOrder, signToken } from "./helpers.js";
import { REVIEW_BONUS_POINTS } from "../controllers/reviewController.js";

const ADMIN_EMAIL = "admin-copy@example.invalid";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms);

beforeEach(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = ADMIN_EMAIL;
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (query = "") =>
  request(app).post(`/api/orders/send-review-requests?secret=${process.env.CRON_SECRET}${query}`);

const delivered = async ({ user, products, deliveredMsAgo, overrides = {} }) => {
  const ps = products || [await createProduct()];
  return createOrder({
    user: user || (await createUser()),
    products: ps,
    overrides: {
      orderStatus: "Delivered",
      deliveredAt: ago(deliveredMsAgo),
      statusHistory: [{ status: "Delivered", changedAt: ago(deliveredMsAgo) }],
      ...overrides,
    },
  });
};

const mailsTo = (email) => sendEmail.mock.calls.map(([m]) => m).filter((m) => m.to === email);
const notices = async (order) => (await Order.findById(order._id).lean()).reviewNotices || {};

describe("Day 1 — delivery feedback email", () => {
  it("goes out 24–72 hours after delivery, in English, with no admin copy and the opt-out footer", async () => {
    const user = await createUser({ name: "Asha" });
    const order = await delivered({ user, deliveredMsAgo: 30 * HOUR });

    const res = await run();

    expect(res.body.feedback.sent).toBe(1);
    const [mail] = mailsTo(user.email);
    expect(mail.subject).toBe("How was your Mittal Collections delivery?");
    expect(mail.html).toContain("Namaste Asha ji,");
    expect(mail.html).toContain(`/my-orders/${order._id}`);
    expect(mail.html).toContain("reminders/unsubscribe?t=");
    expect(mail.bcc).toBeUndefined();
    expect((await notices(order)).feedback.sentAt).toBeTruthy();
  });

  it("uses Hindi for a Hindi customer", async () => {
    const user = await createUser({ name: "रमेश", preferredLanguage: "hi" });
    await delivered({ user, deliveredMsAgo: 30 * HOUR });

    await run();

    const [mail] = mailsTo(user.email);
    expect(mail.subject).toBe("आपकी Mittal Collections डिलीवरी कैसी रही?");
    expect(mail.html).toContain("नमस्ते रमेश जी,");
    expect(mail.html).toContain("ये रिमाइंडर बंद करें");
  });

  it("is not sent before 24 hours, after 72 hours, or once the customer has answered", async () => {
    await delivered({ deliveredMsAgo: 12 * HOUR });
    await delivered({ deliveredMsAgo: 80 * HOUR });
    await delivered({
      deliveredMsAgo: 30 * HOUR,
      overrides: { deliveryFeedback: { response: "yes", submittedAt: new Date(), history: [{ response: "yes", submittedAt: new Date() }] } },
    });

    const res = await run();

    expect(res.body.feedback.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("says just Namaste when the customer has no name", async () => {
    const user = await createUser();
    await User.updateOne({ _id: user._id }, { $set: { name: " " } });
    await delivered({ user, deliveredMsAgo: 30 * HOUR });

    await run();

    expect(mailsTo(user.email)[0].html).toContain("<p>Namaste,</p>");
  });
});

describe("Day 8 — review request", () => {
  it("keeps its wording, adds the opt-out footer, and sends the admin its own copy without the customer's unsubscribe link", async () => {
    const user = await createUser({ name: "Kiran" });
    const order = await delivered({ user, deliveredMsAgo: 9 * DAY });

    const res = await run();

    expect(res.body.request.sent).toBe(1);
    const [customer] = mailsTo(user.email);
    expect(customer.subject).toBe("How was your order? Leave a review");
    expect(customer.html).toContain(`get\n                ${REVIEW_BONUS_POINTS} bonus loyalty points!`);
    expect(customer.html).toContain("reminders/unsubscribe?t=");
    expect(customer.bcc).toBeUndefined();

    const [adminCopy] = mailsTo(ADMIN_EMAIL);
    expect(adminCopy.subject).toBe(customer.subject);
    expect(adminCopy.html).not.toContain("reminders/unsubscribe");
    expect((await Order.findById(order._id)).reviewRequestSent).toBe(true);
  });

  it("leaves out products already reviewed, and sends nothing when every product is reviewed", async () => {
    const user = await createUser();
    const reviewed = await createProduct({ name: "Already Reviewed Sheet" });
    const pending = await createProduct({ name: "Still Unreviewed Towel" });
    const mixed = await delivered({ user, products: [reviewed, pending], deliveredMsAgo: 9 * DAY });
    await Review.create({ product: reviewed._id, user: user._id, order: mixed._id, rating: 4, content: "Nice" });

    const user2 = await createUser();
    const only = await createProduct({ name: "Only Product" });
    await delivered({ user: user2, products: [only], deliveredMsAgo: 9 * DAY });
    await Review.create({ product: only._id, user: user2._id, rating: 5, content: "Good" });

    const res = await run();

    const [mail] = mailsTo(user.email);
    expect(mail.html).toContain("Still Unreviewed Towel");
    expect(mail.html).not.toContain("Already Reviewed Sheet");
    expect(mailsTo(user2.email)).toHaveLength(0);
    expect(res.body.request.skipped.no_eligible_items).toBe(1);
  });

  it("is not sent more than 30 days after delivery", async () => {
    await delivered({ deliveredMsAgo: 31 * DAY });

    const res = await run();

    expect(res.body.request.candidates).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still goes out when the delivery feedback was a No (a complaint never blocks the review request)", async () => {
    const user = await createUser();
    await delivered({
      user,
      deliveredMsAgo: 9 * DAY,
      overrides: { deliveryFeedback: { response: "no", message: "Torn packet", submittedAt: ago(8 * DAY), history: [] } },
    });

    await run();

    expect(mailsTo(user.email)).toHaveLength(1);
  });
});

describe("Day 14 — the one reminder", () => {
  const requestSent = (msAgo) => ({ reviewRequestSent: true, reviewNotices: { request: { sentAt: ago(msAgo), attempts: 1 } } });

  it("goes out once, after the request, only for items still unreviewed, in the customer's language", async () => {
    const user = await createUser({ name: "Meena", preferredLanguage: "hi" });
    const reviewed = await createProduct({ name: "Reviewed Curtain" });
    const pending = await createProduct({ name: "Pending Comforter" });
    const order = await delivered({ user, products: [reviewed, pending], deliveredMsAgo: 15 * DAY, overrides: requestSent(7 * DAY) });
    await Review.create({ product: reviewed._id, user: user._id, order: order._id, rating: 3, content: "Okay" });

    const first = await run();
    const second = await run();

    expect(first.body.reminder.sent).toBe(1);
    expect(second.body.reminder.sent).toBe(0);
    const mails = mailsTo(user.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("आपके रिव्यू के लिए एक छोटा-सा रिमाइंडर");
    expect(mails[0].html).toContain("Pending Comforter");
    expect(mails[0].html).not.toContain("Reviewed Curtain");
    expect(mails[0].html).toContain(`${REVIEW_BONUS_POINTS} लॉयल्टी पॉइंट्स (प्रति ऑर्डर एक बार)`);
    expect(mails[0].bcc).toBeUndefined();
  });

  it("English reminder says it is the only one and the points don't depend on the rating", async () => {
    const user = await createUser({ name: "Ravi" });
    await delivered({ user, deliveredMsAgo: 15 * DAY, overrides: requestSent(7 * DAY) });

    await run();

    const [mail] = mailsTo(user.email);
    expect(mail.subject).toBe("A gentle reminder about your review");
    expect(mail.html).toContain("This is our only reminder.");
    expect(mail.html).toContain(`${REVIEW_BONUS_POINTS} loyalty points (once per order), whatever rating you give`);
  });

  it("never follows a request sent less than 6 days earlier", async () => {
    await delivered({ deliveredMsAgo: 15 * DAY, overrides: requestSent(2 * DAY) });

    const res = await run();

    expect(res.body.reminder.candidates).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a late first request (delivered 16 days ago) is not chased by its reminder in the same run", async () => {
    const user = await createUser();
    await delivered({ user, deliveredMsAgo: 16 * DAY });

    const res = await run();

    expect(res.body.request.sent).toBe(1);
    expect(res.body.reminder.sent).toBe(0);
    expect(mailsTo(user.email)).toHaveLength(1);
  });

  it("follows a request flagged by the old code (no sentAt), but not one never sent", async () => {
    const legacy = await createUser();
    await delivered({ user: legacy, deliveredMsAgo: 15 * DAY, overrides: { reviewRequestSent: true } });
    const never = await createUser();
    await delivered({ user: never, deliveredMsAgo: 15 * DAY, overrides: { reviewRequestSent: false } });

    await run();

    expect(mailsTo(legacy.email).map((m) => m.subject)).toEqual(["A gentle reminder about your review"]);
    expect(mailsTo(never.email).map((m) => m.subject)).toEqual(["How was your order? Leave a review"]);
  });

  it("leaves out returned items and is not sent after 30 days", async () => {
    const user = await createUser();
    const returned = await createProduct({ name: "Returned Dohar" });
    const order = await delivered({ user, products: [returned], deliveredMsAgo: 15 * DAY, overrides: requestSent(7 * DAY) });
    await ReturnRequest.create({
      order: order._id, user: user._id, product: returned._id, productName: returned.name, quantity: 1, reason: "Colour", status: "Refunded",
    });
    await delivered({ deliveredMsAgo: 31 * DAY, overrides: requestSent(20 * DAY) });

    const res = await run();

    expect(res.body.reminder.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("Opt-out and other emails", () => {
  it("an opted-out customer gets none of the three emails", async () => {
    const user = await createUser({ reminderEmailsOptOut: true });
    await delivered({ user, deliveredMsAgo: 30 * HOUR });
    await delivered({ user, deliveredMsAgo: 9 * DAY });
    await delivered({ user, deliveredMsAgo: 15 * DAY, overrides: { reviewRequestSent: true } });

    const res = await run();

    expect(mailsTo(user.email)).toHaveLength(0);
    expect(res.body.feedback.skipped.opted_out).toBe(1);
    expect(res.body.request.skipped.opted_out).toBe(1);
    expect(res.body.reminder.skipped.opted_out).toBe(1);
  });

  it("the opt-out does not stop order status emails", async () => {
    const user = await createUser({ reminderEmailsOptOut: true });
    const admin = await createUser({ role: "admin" });
    const order = await createOrder({ user, products: [await createProduct()], overrides: { orderStatus: "Shipped" } });

    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ status: "Delivered" });
    await vi.waitFor(() => expect(mailsTo(user.email).length).toBeGreaterThan(0));

    expect(mailsTo(user.email)[0].subject).toMatch(/delivered/i);
  });
});

describe("Never a duplicate", () => {
  it("two cron runs at the same moment send each email once", async () => {
    const a = await createUser();
    const b = await createUser();
    await delivered({ user: a, deliveredMsAgo: 30 * HOUR });
    await delivered({ user: b, deliveredMsAgo: 9 * DAY });

    await Promise.all([run(), run(), run()]);

    expect(mailsTo(a.email)).toHaveLength(1);
    expect(mailsTo(b.email)).toHaveLength(1);
  });

  it("a provider refusal (4xx) is retried on later runs, at most 3 attempts in all", async () => {
    const user = await createUser();
    const order = await delivered({ user, deliveredMsAgo: 30 * HOUR });
    sendEmail.mockRejectedValue(new Error("Brevo send failed (400): bad request"));

    for (let i = 0; i < 5; i += 1) await run();

    expect(mailsTo(user.email)).toHaveLength(3);
    const state = (await notices(order)).feedback;
    expect(state.attempts).toBe(3);
    expect(state.gaveUpAt).toBeTruthy();
    expect(state.lastError).toBe("provider_refused");
    expect(state.sentAt).toBeFalsy();
  });

  it.each([
    ["a timeout", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })],
    ["a 5xx", new Error("Brevo send failed (502): bad gateway")],
    ["a network error", new TypeError("fetch failed")],
  ])("%s is never retried (the email may already have gone out)", async (_label, error) => {
    const user = await createUser();
    const order = await delivered({ user, deliveredMsAgo: 30 * HOUR });
    sendEmail.mockRejectedValueOnce(error);

    await run();
    await run();

    expect(mailsTo(user.email)).toHaveLength(1);
    const state = (await notices(order)).feedback;
    expect(state.attempts).toBe(1);
    expect(state.gaveUpAt).toBeTruthy();
    expect(state.lastError).toBe("uncertain_delivery");
  });

  it("a send that crashed before it was confirmed is reported, not re-sent", async () => {
    const user = await createUser();
    await delivered({
      user,
      deliveredMsAgo: 30 * HOUR,
      overrides: { reviewNotices: { feedback: { claimedAt: ago(2 * HOUR), attempts: 1 } } },
    });

    const res = await run();

    expect(mailsTo(user.email)).toHaveLength(0);
    expect(res.body.feedback.skipped.claimed_not_confirmed).toBe(1);
  });

  it("one order's database error does not stop the rest of the run", async () => {
    const first = await createUser();
    const second = await createUser();
    await delivered({ user: first, deliveredMsAgo: 30 * HOUR });
    await delivered({ user: second, deliveredMsAgo: 31 * HOUR });
    const real = Order.findOneAndUpdate.bind(Order);
    vi.spyOn(Order, "findOneAndUpdate")
      .mockImplementationOnce(() => Promise.reject(new Error("db blip")))
      .mockImplementation(real);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await run();

    expect(res.status).toBe(200);
    expect(res.body.feedback.errors).toBe(1);
    expect(res.body.feedback.sent).toBe(1);
  });

  it("never logs the customer's email address", async () => {
    const user = await createUser();
    await delivered({ user, deliveredMsAgo: 30 * HOUR });
    sendEmail.mockRejectedValueOnce(new Error("Brevo send failed (400): x"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await run();

    expect(JSON.stringify(logged.mock.calls)).not.toContain(user.email);
  });
});

describe("Dry run", () => {
  const seed = async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const orders = [
      await delivered({ user: a, deliveredMsAgo: 30 * HOUR }),
      await delivered({ user: b, deliveredMsAgo: 9 * DAY }),
      await delivered({ user: c, deliveredMsAgo: 15 * DAY, overrides: { reviewRequestSent: true } }),
    ];
    return { users: [a, b, c], orders };
  };

  it.each(["&dryRun=1", "&dryRun=true", "&dryrun=1", "&dry_run=1", "&dryRun=1&dryRun=1", "&dryRun[]=1"])(
    "%s reports counts and masked ids, and writes nothing",
    async (query) => {
      const { users, orders } = await seed();
      const before = await Order.find().sort({ _id: 1 }).lean();

      const res = await run(query);

      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(true);
      expect(res.body.feedback.eligible).toBe(1);
      expect(res.body.request.eligible).toBe(1);
      expect(res.body.reminder.eligible).toBe(1);
      expect(res.body.feedback.orders).toEqual([`…${String(orders[0]._id).slice(-6)}`]);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(await Order.find().sort({ _id: 1 }).lean()).toEqual(before);
      for (const u of users) {
        expect((await User.findById(u._id).select("+reminderOptOutToken").lean()).reminderOptOutToken).toBeUndefined();
      }
    },
  );

  it("a live run lists no order ids", async () => {
    await seed();

    const res = await run();

    expect(res.body.dryRun).toBe(false);
    for (const step of ["feedback", "request", "reminder"]) expect(res.body[step].orders).toBeUndefined();
  });

  it("dryRun=0 is a live run, and the endpoint still needs the cron secret", async () => {
    await seed();

    expect((await run("&dryRun=0")).body.dryRun).toBe(false);
    expect((await request(app).post("/api/orders/send-review-requests?dryRun=1")).status).toBe(401);
  });
});
