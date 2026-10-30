import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { createUser, createProduct } from "./helpers.js";

const REVIEW_REQUEST_DELAY_DAYS = 8; // must match orderController.js

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const createDeliveredOrder = async (user, product, overrides = {}) =>
  Order.create({
    user: user._id,
    orderItems: [
      {
        product: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: 1,
      },
    ],
    shippingAddress,
    totalPrice: product.price,
    orderStatus: "Delivered",
    deliveredAt: daysAgo(REVIEW_REQUEST_DELAY_DAYS + 1),
    ...overrides,
  });

const callReviewRequests = (secret = process.env.CRON_SECRET) =>
  request(app).post(
    `/api/orders/send-review-requests${secret ? `?secret=${secret}` : ""}`,
  );

const itemOf = (product, size = "", quantity = 1) => ({
  product: product._id,
  name: product.name,
  image: product.image,
  price: product.price,
  quantity,
  size,
});

const returnFor = (order, user, product, status, size = "", quantity = 1) =>
  ReturnRequest.create({
    order: order._id,
    user: user._id,
    product: product._id,
    productName: product.name,
    quantity,
    size,
    reason: "Not as expected",
    status,
  });

const emailedHtml = () => sendEmail.mock.calls.map(([args]) => args.html).join("\n");

describe("POST /api/orders/send-review-requests", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
  });

  it("rejects a request without the correct secret", async () => {
    const res = await callReviewRequests("wrong-secret");

    expect(res.status).toBe(401);
  });

  it("only targets Delivered orders past the delay that haven't been requested yet", async () => {
    const product = await createProduct({ price: 500, stock: 5 });

    const staleUser = await createUser();
    await createDeliveredOrder(staleUser, product); // past the delay, never requested

    const freshUser = await createUser();
    await createDeliveredOrder(freshUser, product, {
      deliveredAt: daysAgo(1), // too recent
    });

    const notDeliveredUser = await createUser();
    await createDeliveredOrder(notDeliveredUser, product, {
      orderStatus: "Shipped",
    });

    const alreadyRequestedUser = await createUser();
    await createDeliveredOrder(alreadyRequestedUser, product, {
      reviewRequestSent: true,
    });

    const res = await callReviewRequests();

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("does not re-target an order on a second run once a request has been recorded", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, product);

    // Simulate a request having already been sent (independent of whether
    // the outbound email itself succeeds in this environment).
    await Order.findByIdAndUpdate(order._id, { reviewRequestSent: true });

    const res = await callReviewRequests();

    expect(res.body.total).toBe(0);
  });

  it("emails a delivered COD order (isPaid false) like any other", async () => {
    const product = await createProduct({ name: "COD Sheet", price: 500, stock: 5 });
    const user = await createUser();
    await createDeliveredOrder(user, product, { paymentMethod: "COD", isPaid: false });

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(1);
    expect(emailedHtml()).toContain("COD Sheet");
  });

  it("does not target an order cancelled after delivery (full return)", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const user = await createUser();
    await createDeliveredOrder(user, product, { orderStatus: "Cancelled" });

    const res = await callReviewRequests();

    expect(res.body.total).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves a returned item out of a partially returned order's email", async () => {
    const returned = await createProduct({ name: "Returned Curtain", price: 500, stock: 5 });
    const kept = await createProduct({ name: "Kept Comforter", price: 900, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, returned, {
      orderItems: [itemOf(returned), itemOf(kept)],
    });
    await returnFor(order, user, returned, "Refunded");

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(1);
    expect(emailedHtml()).toContain("Kept Comforter");
    expect(emailedHtml()).not.toContain("Returned Curtain");
  });

  it("treats a return still in progress as returned, but a rejected one as not", async () => {
    const pending = await createProduct({ name: "Pending Return Towel", price: 300, stock: 5 });
    const rejected = await createProduct({ name: "Rejected Return Sheet", price: 400, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, pending, {
      orderItems: [itemOf(pending), itemOf(rejected)],
    });
    await returnFor(order, user, pending, "Requested");
    await returnFor(order, user, rejected, "Rejected");

    await callReviewRequests();

    expect(emailedHtml()).toContain("Rejected Return Sheet");
    expect(emailedHtml()).not.toContain("Pending Return Towel");
  });

  it("only drops the returned size when one size of a product is returned", async () => {
    const product = await createProduct({ name: "Sized Bedsheet", price: 800, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, product, {
      orderItems: [itemOf(product, "King"), itemOf(product, "Queen")],
    });
    await returnFor(order, user, product, "Picked Up", "King");

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(1);
    expect(sendEmail.mock.calls[0][0].html.match(/Sized Bedsheet/g)).toHaveLength(1);
  });

  it("still asks about a line when only part of its quantity was returned (kept 1 of 2)", async () => {
    const product = await createProduct({ name: "Pair Of Pillows", price: 400, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, product, {
      orderItems: [itemOf(product, "", 2)],
    });
    await returnFor(order, user, product, "Refunded", "", 1);

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(1);
    expect(emailedHtml()).toContain("Pair Of Pillows");
  });

  it("drops a line once its whole quantity was returned (returned 2 of 2)", async () => {
    const both = await createProduct({ name: "Both Returned Set", price: 400, stock: 5 });
    const kept = await createProduct({ name: "Kept Runner", price: 300, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, both, {
      orderItems: [itemOf(both, "", 2), itemOf(kept)],
    });
    await returnFor(order, user, both, "Picked Up", "", 2);

    await callReviewRequests();

    expect(emailedHtml()).toContain("Kept Runner");
    expect(emailedHtml()).not.toContain("Both Returned Set");
  });

  it("counts a rejected partial return as kept again", async () => {
    const product = await createProduct({ name: "Rejected Partial Quilt", price: 900, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, product, { orderItems: [itemOf(product, "", 1)] });
    await returnFor(order, user, product, "Rejected", "", 1);

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(1);
    expect(emailedHtml()).toContain("Rejected Partial Quilt");
  });

  it("sends nothing and keeps the order unclaimed when every item was returned", async () => {
    const a = await createProduct({ name: "Item A", price: 500, stock: 5 });
    const b = await createProduct({ name: "Item B", price: 500, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, a, { orderItems: [itemOf(a), itemOf(b)] });
    await returnFor(order, user, a, "Refunded");
    await returnFor(order, user, b, "Approved");

    const res = await callReviewRequests();

    expect(res.body.sent).toBe(0);
    expect(res.body.skippedNoEligibleItems).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await Order.findById(order._id)).reviewRequestSent).toBe(false);
  });

  it("never re-sends once sent, across two runs", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const user = await createUser();
    await createDeliveredOrder(user, product);

    await callReviewRequests();
    await callReviewRequests();

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the email fails, so the next run retries", async () => {
    const product = await createProduct({ price: 500, stock: 5 });
    const user = await createUser();
    const order = await createDeliveredOrder(user, product);
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    const first = await callReviewRequests();
    expect(first.body.sent).toBe(0);
    expect((await Order.findById(order._id)).reviewRequestSent).toBe(false);

    const second = await callReviewRequests();
    expect(second.body.sent).toBe(1);
  });
});
