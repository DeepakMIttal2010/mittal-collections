import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import { createUser, createProduct, signToken } from "./helpers.js";

const callPriceDropAlerts = (secret = process.env.CRON_SECRET) =>
  request(app).post(
    `/api/wishlist/send-price-drop-alerts${secret ? `?secret=${secret}` : ""}`,
  );

describe("POST /api/wishlist/send-price-drop-alerts", () => {
  it("rejects a request without the correct secret", async () => {
    const res = await callPriceDropAlerts("wrong-secret");

    expect(res.status).toBe(401);
  });

  it("only targets wishlist items whose product price dropped below the last alerted baseline", async () => {
    const droppedProduct = await createProduct({ price: 800 });
    const droppedUser = await createUser();
    await Wishlist.create({
      user: droppedUser._id,
      product: droppedProduct._id,
      priceWhenAdded: 1000,
    });

    const unchangedProduct = await createProduct({ price: 1000 });
    const unchangedUser = await createUser();
    await Wishlist.create({
      user: unchangedUser._id,
      product: unchangedProduct._id,
      priceWhenAdded: 1000,
    });

    const alreadyAlertedProduct = await createProduct({ price: 700 });
    const alreadyAlertedUser = await createUser();
    await Wishlist.create({
      user: alreadyAlertedUser._id,
      product: alreadyAlertedProduct._id,
      priceWhenAdded: 1000,
      lastAlertedPrice: 700, // already notified at this exact price
    });

    const res = await callPriceDropAlerts();

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("does not re-target the same item on a second run once the alert baseline is recorded", async () => {
    const product = await createProduct({ price: 800 });
    const user = await createUser();
    const item = await Wishlist.create({
      user: user._id,
      product: product._id,
      priceWhenAdded: 1000,
    });

    // Simulate an alert having already been recorded for the current price
    // (independent of whether the outbound email itself succeeds in this
    // environment).
    await Wishlist.findByIdAndUpdate(item._id, { lastAlertedPrice: 800 });

    const res = await callPriceDropAlerts();

    expect(res.body.total).toBe(0);
  });

  it("re-targets an item that drops again after an earlier alert", async () => {
    const product = await createProduct({ price: 600 });
    const user = await createUser();
    await Wishlist.create({
      user: user._id,
      product: product._id,
      priceWhenAdded: 1000,
      lastAlertedPrice: 800, // alerted once already, price has since dropped further
    });

    const res = await callPriceDropAlerts();

    expect(res.body.total).toBe(1);
  });

  it("snapshots the product's current price when adding to the wishlist", async () => {
    const product = await createProduct({ price: 555 });
    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/wishlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.wishlistItem.priceWhenAdded).toBe(555);

    const stillThere = await Product.findById(product._id);
    expect(stillThere.price).toBe(555); // sanity check, unrelated to the wishlist snapshot
  });
});
