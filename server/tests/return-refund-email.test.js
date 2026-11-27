import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// My Orders -> Cancel/Return audit 2026-11-27, OR-03.
// The "Refunded" email told every customer the money would "reflect in your
// original payment method within 5-7 business days". A Cash on Delivery
// order has no payment method to send money back to, and the refund is
// arranged by hand. The email now follows the order's payment method, in
// the owner-approved wording (no day promise for COD).

const ONLINE =
  "Refunds for online payments will be processed to the original payment method within 5–7 business days.";
const COD =
  "For Cash on Delivery (COD) orders, refunds will be arranged through UPI or bank transfer. Our team will contact you to collect the required details.";

beforeEach(async () => {
  sendEmail.mockReset().mockResolvedValue(undefined);
  await seedSiteSettings({ codCharge: 0 });
});
afterEach(() => vi.restoreAllMocks());

const DAY = 24 * 60 * 60 * 1000;

const setup = async ({ paymentMethod, isPaid }) => {
  const customer = await createUser();
  const admin = await createUser({ role: "admin" });
  const product = await createProduct({ price: 500, stock: 5 });
  const order = await Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, price: 500, quantity: 1, size: "" }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201012",
    },
    paymentMethod,
    isPaid,
    totalPrice: 500,
    orderStatus: "Delivered",
    deliveredAt: new Date(Date.now() - 2 * DAY),
  });
  const returnRequest = await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    product: product._id,
    productName: product.name,
    quantity: 1,
    reason: "Wrong size",
    status: "Picked Up",
  });
  return { customer, adminToken: signToken(admin), returnRequest };
};

const moveTo = async (s, status) => {
  const res = await request(app)
    .put(`/api/returns/${s.returnRequest._id}/status`)
    .set("Authorization", `Bearer ${s.adminToken}`)
    .send({ status });
  expect(res.status).toBe(200);
};

// The customer email is sent without being awaited by the request.
const customerEmail = async (s) => {
  await vi.waitFor(() => {
    expect(sendEmail.mock.calls.some(([mail]) => mail.to === s.customer.email)).toBe(true);
  });
  return sendEmail.mock.calls.find(([mail]) => mail.to === s.customer.email)[0];
};

describe("OR-03: the Refunded email follows the order's payment method", () => {
  it("E1 COD order: UPI / bank transfer wording, no 'original payment method', no day promise", async () => {
    const s = await setup({ paymentMethod: "COD", isPaid: true });
    await moveTo(s, "Refunded");
    const mail = await customerEmail(s);
    expect(mail.html).toContain(COD);
    expect(mail.html).not.toContain("original payment method");
    expect(mail.html).not.toMatch(/business days/);
  });

  it("E2 online (Razorpay) order: the approved online wording", async () => {
    const s = await setup({ paymentMethod: "Razorpay", isPaid: true });
    await moveTo(s, "Refunded");
    const mail = await customerEmail(s);
    expect(mail.html).toContain(ONLINE);
    expect(mail.html).not.toContain("Cash on Delivery");
  });

  it("E3 guard: other statuses carry no refund sentence", async () => {
    const s = await setup({ paymentMethod: "COD", isPaid: true });
    await ReturnRequest.updateOne({ _id: s.returnRequest._id }, { $set: { status: "Requested" } });
    await moveTo(s, "Approved");
    const mail = await customerEmail(s);
    expect(mail.subject).toBe('Your return request is now "Approved"');
    expect(mail.html).not.toContain("refund");
  });
});
