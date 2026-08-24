import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import { createUser, createProduct } from "./helpers.js";

const REVIEW_REQUEST_DELAY_DAYS = 4; // must match orderController.js

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

describe("POST /api/orders/send-review-requests", () => {
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
});
