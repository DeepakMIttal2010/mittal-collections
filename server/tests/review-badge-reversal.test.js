import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  return { sendEmail: vi.fn() };
});
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Real transactions (approval, refund, cancellation and reversals all run in
// them), same as review-bonus-returns.test.js.
import "./setup-replset.js";
import app from "../app.js";
import Review from "../models/Review.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyLot from "../models/LoyaltyLot.js";
import { applyLoyaltyPointsChange, expireDueLots } from "../utils/loyaltyPoints.js";
import { createUser, signToken, createProduct, createOrder, seedSiteSettings } from "./helpers.js";

// Rewards/loyalty audit 2026-11-26, RW-03 (owner decision: option A). A
// public review shows "Received 50 loyalty points for reviewing" while
// `rewarded` is true. It was `pointsAwarded > 0` only, so the badge stayed
// after the bonus was taken back (full return, order cancellation, admin
// reversal). It must show only while the bonus is still held — and the
// reversal details themselves must never reach a public response.

beforeEach(async () => {
  sendEmail.mockReset().mockResolvedValue(undefined);
  await seedSiteSettings({ codCharge: 0 });
});
afterEach(() => vi.restoreAllMocks());

const setup = async () => {
  const customer = await createUser();
  const admin = await createUser({ role: "admin" });
  const product = await createProduct({ stock: 10 });
  const order = await createOrder({ user: customer, products: [product], overrides: { deliveredAt: new Date() } });
  // Photo + consent so the review is also in the public photo showcase.
  const review = await Review.create({
    product: product._id,
    user: customer._id,
    order: order._id,
    rating: 5,
    content: "Lovely bedsheet, colours as shown",
    images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    photoConsent: true,
  });
  return { customer, admin, adminToken: signToken(admin), product, order, review };
};
const auth = (s) => ({ Authorization: `Bearer ${s.adminToken}` });
const approve = (s) => request(app).put(`/api/reviews/${s.review._id}/approve`).set(auth(s));
const setReturnStatus = (s, id, status) => request(app).put(`/api/returns/${id}/status`).set(auth(s)).send({ status });
const setOrderStatus = (s, status) => request(app).put(`/api/orders/${s.order._id}/status`).set(auth(s)).send({ status });
const adminReverse = (s) =>
  request(app).post(`/api/reviews/${s.review._id}/reverse-bonus`).set(auth(s)).send({ reason: "Same photos posted from three accounts" });

const publicReview = async (s) => {
  const res = await request(app).get(`/api/reviews/product/${s.product._id}`);
  expect(res.status).toBe(200);
  return res.body.reviews.find((r) => r._id === String(s.review._id));
};
const showcaseReview = async (s) => {
  const res = await request(app).get("/api/reviews/showcase");
  expect(res.status).toBe(200);
  return res.body.reviews.find((r) => r._id === String(s.review._id));
};
const paidThenFullReturnRefunded = async () => {
  const s = await setup();
  expect((await approve(s)).status).toBe(200);
  const rr = await ReturnRequest.create({
    order: s.order._id,
    user: s.customer._id,
    product: s.product._id,
    productName: s.product.name,
    quantity: 1,
    reason: "Didn't like it",
    status: "Requested",
  });
  expect((await setReturnStatus(s, rr._id, "Refunded")).status).toBe(200);
  return s;
};

describe("RW-03: public 'rewarded' badge follows the bonus actually kept", () => {
  it("T1 bonus paid and kept: rewarded true", async () => {
    const s = await setup();
    expect((await approve(s)).status).toBe(200);
    expect((await publicReview(s)).rewarded).toBe(true);
  });

  it("T2 full return refunded (bonus reversed by the system): rewarded false", async () => {
    const s = await paidThenFullReturnRefunded();
    expect((await Review.findById(s.review._id).select("+bonusReversal")).bonusReversal?.reason).toBe("Item returned");
    expect((await publicReview(s)).rewarded).toBe(false);
  });

  it("T3 order cancelled after the bonus was paid: rewarded false", async () => {
    const s = await setup();
    expect((await approve(s)).status).toBe(200);
    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);
    expect((await publicReview(s)).rewarded).toBe(false);
  });

  it("T4 admin reversal while the review stays public: rewarded false", async () => {
    const s = await setup();
    expect((await approve(s)).status).toBe(200);
    expect((await adminReverse(s)).status).toBe(200);
    const pub = await publicReview(s);
    expect(pub).toBeDefined();
    expect(pub.rewarded).toBe(false);
  });

  it("T5 reversal after part of the bonus had expired: still reversed, rewarded false", async () => {
    const s = await setup();
    expect((await approve(s)).status).toBe(200);
    await applyLoyaltyPointsChange({ userId: s.customer._id, type: "redeemed", source: "order", points: -20, key: "test:spent-20" });
    await LoyaltyLot.updateOne({ key: `review:${s.review._id}` }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await expireDueLots();
    expect((await setOrderStatus(s, "Cancelled")).status).toBe(200);
    expect((await publicReview(s)).rewarded).toBe(false);
  });

  it("T6 bonus held (order already cancelled at approval, 0 points): rewarded false", async () => {
    const s = await setup();
    await s.order.updateOne({ orderStatus: "Cancelled" });
    expect((await approve(s)).status).toBe(200);
    expect((await Review.findById(s.review._id)).pointsAwarded).toBe(0);
    expect((await publicReview(s)).rewarded).toBe(false);
  });

  it("T7 photo showcase follows the same rule (kept true, reversed false)", async () => {
    const kept = await setup();
    expect((await approve(kept)).status).toBe(200);
    expect((await showcaseReview(kept)).rewarded).toBe(true);

    const reversed = await paidThenFullReturnRefunded();
    expect((await showcaseReview(reversed)).rewarded).toBe(false);
  });

  it("T8 privacy: no reversal or hold details in public responses", async () => {
    const s = await paidThenFullReturnRefunded();
    const product = await request(app).get(`/api/reviews/product/${s.product._id}`);
    const showcase = await request(app).get("/api/reviews/showcase");
    for (const body of [JSON.stringify(product.body), JSON.stringify(showcase.body)]) {
      for (const leak of ["bonusReversal", "bonusHold", "reversedBy", "reversedAt", "Item returned", "pointsDebited", "pointsAwarded"]) {
        expect(body, leak).not.toContain(leak);
      }
    }
  });
});
