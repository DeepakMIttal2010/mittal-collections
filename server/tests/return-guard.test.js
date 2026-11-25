import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

// PR-4 (admin audit RC-01 + RC-02).
//
// RC-01: the unique index meant to allow only one OPEN return per order line
// used partialFilterExpression { status: { $ne: "Rejected" } }, which MongoDB
// (8.0 in production) cannot build -- so it never existed and two concurrent
// submissions could both create a live return. It must be a supported
// filter on the open statuses only: Requested, Approved, Picked Up.
//
// RC-02: a closed (Refunded) return must not block returning the rest of
// the line; the quantity still returnable is the line quantity minus every
// non-Rejected return on it.

// No real email from these tests (order, status and return notices).
vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

// Replica set: real indexes and real concurrent writes.
import "./setup-replset.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedLoyaltySettings, seedSiteSettings } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

const OPEN_STATUSES = ["Requested", "Approved", "Picked Up"];

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

// Delivered COD order of `quantity` units of one product (stock 10 -> 10-quantity).
const deliveredOrder = async (quantity = 3) => {
  await seedSiteSettings({ codCharge: 0 });
  await seedLoyaltySettings({ earnRate: 20 });
  const customer = await createUser();
  const token = signToken(customer);
  const adminToken = signToken(await createUser({ role: "admin" }));
  const product = await createProduct({ price: 1000, stock: 10 });

  const placed = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      orderItems: [{ product: String(product._id), name: product.name, image: product.image, price: 1000, quantity }],
      shippingAddress,
      paymentMethod: "COD",
    });
  expect(placed.status).toBe(201);
  const order = placed.body.order;

  const delivered = await request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "Delivered" });
  expect(delivered.status).toBe(200);

  return { customer, token, adminToken, product, order };
};

const requestReturn = (s, quantity) =>
  request(app)
    .post("/api/returns")
    .set("Authorization", `Bearer ${s.token}`)
    .send({ orderId: String(s.order._id), productId: String(s.product._id), quantity, reason: "Didn't like it" });

const moveReturn = (s, id, status) =>
  request(app)
    .put(`/api/returns/${id}/status`)
    .set("Authorization", `Bearer ${s.adminToken}`)
    .send({ status });

// Requested -> Picked Up -> Refunded (stock comes back, refund recorded).
const refund = async (s, id) => {
  expect((await moveReturn(s, id, "Picked Up")).status).toBe(200);
  expect((await moveReturn(s, id, "Refunded")).status).toBe(200);
};

// Builds the model's indexes; an index MongoDB refuses is left out (as it
// silently is in production) so the behaviour tests below show what that means.
const buildIndexesBestEffort = () => ReturnRequest.init().catch(() => {});

const activeReturns = (s) =>
  ReturnRequest.countDocuments({ order: s.order._id, status: { $in: OPEN_STATUSES } });

describe("RC-01: one open return per order line, enforced by the database", () => {
  it("1. the unique partial index exists, on the open statuses only, matching the schema enum", async () => {
    await ReturnRequest.init();
    const indexes = await ReturnRequest.collection.indexes();
    const guard = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ order: 1, product: 1, size: 1 }));

    expect(guard, "unique {order, product, size} index missing").toBeTruthy();
    expect(guard.unique).toBe(true);
    expect(guard.partialFilterExpression).toEqual({ status: { $in: OPEN_STATUSES } });

    // Every open status is a real status; Rejected and Refunded are not in it.
    const statusEnum = ReturnRequest.schema.path("status").enumValues;
    expect(OPEN_STATUSES.every((s) => statusEnum.includes(s))).toBe(true);
    expect(statusEnum.filter((s) => !OPEN_STATUSES.includes(s)).sort()).toEqual(["Refunded", "Rejected"]);
  });

  it("2. two open returns for the same line cannot both be written, even bypassing the app check", async () => {
    await buildIndexesBestEffort();
    const s = await deliveredOrder(3);
    const doc = () => ({
      order: s.order._id,
      user: s.customer._id,
      product: s.product._id,
      productName: s.product.name,
      quantity: 1,
      reason: "Didn't like it",
      size: "",
    });

    const results = await Promise.allSettled([ReturnRequest.create(doc()), ReturnRequest.create(doc())]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected").reason.code).toBe(11000);
    expect(await activeReturns(s)).toBe(1);
  });

  it("3. two concurrent customer submissions: one succeeds, the other gets a clear duplicate response; side effects happen once", async () => {
    await buildIndexesBestEffort();
    const s = await deliveredOrder(3); // stock 10 -> 7

    const [a, b] = await Promise.all([requestReturn(s, 1), requestReturn(s, 1)]);

    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const loser = a.status === 400 ? a : b;
    expect(loser.body.message).toMatch(/already exists/i);
    expect(await activeReturns(s)).toBe(1);

    // The single live return, carried through, restocks and refunds once.
    const winner = (a.status === 201 ? a : b).body.returnRequest;
    await refund(s, winner._id);
    expect((await Product.findById(s.product._id)).stock).toBe(8);
    expect((await Order.findById(s.order._id)).refundedAmount).toBe(1000);
  });

  it("4. a duplicate-key error from the database becomes the same 400, not a 500", async () => {
    await buildIndexesBestEffort();
    const s = await deliveredOrder(3);

    // A competing open return lands after the app's own checks passed and
    // right before its write -- only the index can stop the second one.
    const realCreate = ReturnRequest.create.bind(ReturnRequest);
    vi.spyOn(ReturnRequest, "create").mockImplementationOnce(async (doc, ...rest) => {
      await ReturnRequest.collection.insertOne({ ...doc, status: "Requested", createdAt: new Date(), updatedAt: new Date() });
      return realCreate(doc, ...rest);
    });

    const res = await requestReturn(s, 1);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
    vi.restoreAllMocks();
    expect(await activeReturns(s)).toBe(1);
  });
});

describe("RC-02: the rest of a line can be returned after a closed return", () => {
  for (const [first, allowed] of [
    [1, 2],
    [2, 1],
  ]) {
    it(`5. order of 3, ${first} refunded -> a new return is allowed, capped at the ${allowed} still returnable`, async () => {
      const s = await deliveredOrder(3);
      const r1 = await requestReturn(s, first);
      expect(r1.status).toBe(201);
      await refund(s, r1.body.returnRequest._id);

      const r2 = await requestReturn(s, 3);

      expect(r2.status).toBe(201);
      expect(r2.body.returnRequest.quantity).toBe(allowed);
    });
  }

  it("6. order of 3, all 3 refunded -> nothing left, refused with a clear message", async () => {
    const s = await deliveredOrder(3);
    const r1 = await requestReturn(s, 3);
    await refund(s, r1.body.returnRequest._id);

    const r2 = await requestReturn(s, 1);

    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/already been returned|nothing left|no .*left/i);
    expect(await ReturnRequest.countDocuments({ order: s.order._id })).toBe(1);
  });

  it("7. refunded 1 then 1 more refunded -> exactly 1 left", async () => {
    const s = await deliveredOrder(3);
    for (const qty of [1, 1]) {
      const r = await requestReturn(s, qty);
      expect(r.status).toBe(201);
      await refund(s, r.body.returnRequest._id);
    }

    const r3 = await requestReturn(s, 3);

    expect(r3.status).toBe(201);
    expect(r3.body.returnRequest.quantity).toBe(1);
  });

  it("8. guard: a Rejected return does not use up any quantity", async () => {
    const s = await deliveredOrder(3);
    const r1 = await requestReturn(s, 3);
    expect((await moveReturn(s, r1.body.returnRequest._id, "Rejected")).status).toBe(200);

    const r2 = await requestReturn(s, 3);

    expect(r2.status).toBe(201);
    expect(r2.body.returnRequest.quantity).toBe(3);
  });

  it("9. guard: while one return is still open, a second one is refused even if quantity remains", async () => {
    const s = await deliveredOrder(3);
    expect((await requestReturn(s, 1)).status).toBe(201);

    const r2 = await requestReturn(s, 1);

    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/already exists/i);
  });

  it("10. stock comes back exactly per returned unit across two partial returns", async () => {
    const s = await deliveredOrder(3); // 10 -> 7
    const r1 = await requestReturn(s, 1);
    await refund(s, r1.body.returnRequest._id); // 8
    const r2 = await requestReturn(s, 2);
    expect(r2.status).toBe(201);
    await refund(s, r2.body.returnRequest._id); // 10

    expect((await Product.findById(s.product._id)).stock).toBe(10);
    expect((await Order.findById(s.order._id)).refundedAmount).toBe(3000);
  });
});
