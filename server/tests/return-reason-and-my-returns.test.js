import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// My Orders -> Cancel/Return audit 2026-11-27.
// OR-06: the return reason had no length limit (it is stored and emailed to
//        the admin); it is now at most 1000 characters, and a reason that
//        is not text is a 400, not a 500.
// OR-07: GET /returns/my sent the whole document, including internal flags
//        (stockRestored, pointsClawedBack, isSeenByAdmin, the user id);
//        it now sends only what the customer's Returns page needs.

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  sendEmail.mockReset().mockResolvedValue(undefined);
  await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
});

const setup = async () => {
  const customer = await createUser();
  const product = await createProduct({ price: 500, stock: 5 });
  const order = await Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, price: 500, quantity: 1, size: "", isReturnable: true, returnPeriodDays: 7 }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201012",
    },
    totalPrice: 500,
    orderStatus: "Delivered",
    deliveredAt: new Date(Date.now() - 2 * DAY),
  });
  return { customer, product, order };
};

const askReturn = (s, reason) =>
  request(app)
    .post("/api/returns")
    .set("Authorization", `Bearer ${signToken(s.customer)}`)
    .send({ orderId: String(s.order._id), productId: String(s.product._id), quantity: 1, reason });

describe("OR-06: return reason length", () => {
  it("R1 a reason over 1000 characters is refused and nothing is saved", async () => {
    const s = await setup();
    const res = await askReturn(s, "a".repeat(1001));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Reason must be 1000 characters or fewer");
    expect(await ReturnRequest.countDocuments()).toBe(0);
  });

  it("R2 guard: exactly 1000 characters is accepted", async () => {
    const s = await setup();
    const res = await askReturn(s, "a".repeat(1000));
    expect(res.status).toBe(201);
  });

  it("R3 guard: the limit counts the trimmed reason", async () => {
    const s = await setup();
    const res = await askReturn(s, `   ${"a".repeat(1000)}   `);
    expect(res.status).toBe(201);
    expect((await ReturnRequest.findOne()).reason).toHaveLength(1000);
  });

  it("R4 a reason that is not text is a 400, not a server error", async () => {
    const s = await setup();
    for (const reason of [["Wrong size"], { text: "Wrong size" }, 42]) {
      const res = await askReturn(s, reason);
      expect(res.status).toBe(400);
    }
    expect(await ReturnRequest.countDocuments()).toBe(0);
  });
});

describe("OR-07: GET /returns/my sends only what the Returns page needs", () => {
  it("M1 no internal fields in the response", async () => {
    const s = await setup();
    await ReturnRequest.create({
      order: s.order._id,
      user: s.customer._id,
      product: s.product._id,
      productName: s.product.name,
      productImage: "img.jpg",
      quantity: 1,
      reason: "Wrong size",
      status: "Refunded",
      adminNote: "Refund sent",
      isSeenByAdmin: true,
      stockRestored: true,
      pointsClawedBack: true,
      refundedAt: new Date(),
      stockRestoredAt: new Date(),
    });
    const res = await request(app).get("/api/returns/my").set("Authorization", `Bearer ${signToken(s.customer)}`);
    expect(res.status).toBe(200);
    const [ret] = res.body.returns;
    expect(Object.keys(ret).sort()).toEqual(
      [
        "_id",
        "adminNote",
        "createdAt",
        "order",
        "product",
        "productImage",
        "productName",
        "quantity",
        "reason",
        "refundedAt",
        "size",
        "status",
        "updatedAt",
      ].sort(),
    );
    expect(ret).toMatchObject({ productName: s.product.name, productImage: "img.jpg", quantity: 1, status: "Refunded", adminNote: "Refund sent" });
  });

  it("M2 guard: still only the customer's own returns, newest first", async () => {
    const s = await setup();
    const other = await createUser();
    const base = { order: s.order._id, product: s.product._id, productName: "x", quantity: 1, reason: "r", status: "Rejected" };
    await ReturnRequest.create({ ...base, user: s.customer._id, createdAt: new Date(Date.now() - DAY) });
    await ReturnRequest.create({ ...base, user: s.customer._id, reason: "newer" });
    await ReturnRequest.create({ ...base, user: other._id, reason: "someone else" });
    const res = await request(app).get("/api/returns/my").set("Authorization", `Bearer ${signToken(s.customer)}`);
    expect(res.body.returns.map((r) => r.reason)).toEqual(["newer", "r"]);
  });
});
