import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Stub outbound email so these tests are deterministic and don't
// depend on real Brevo credentials/network — this file only cares
// about StockAlert/Notification side effects, not email delivery.
vi.mock("../config/mailer.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import "./setup.js";
import app from "../app.js";
import StockAlert from "../models/StockAlert.js";
import Notification from "../models/Notification.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const subscribe = (productId, email) =>
  request(app).post(`/api/products/${productId}/notify`).send({ email });

// PUT /api/products/:id is multipart/form-data (image upload middleware
// sits in front of it) — send it as form fields with no actual files,
// which the controller and imageOptimizer both handle as a no-op.
const restockProduct = (adminToken, product, stock) =>
  request(app)
    .put(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .field("name", product.name)
    .field("description", product.description)
    .field("price", String(product.price))
    .field("category", product.category.toString())
    .field("stock", String(stock))
    .field("existingImages", JSON.stringify([product.image]));

describe("Back-in-stock alerts", () => {
  it("does not create a duplicate StockAlert for the same email + product", async () => {
    const product = await createProduct({ stock: 0 });

    await subscribe(product._id, "shopper@example.com");
    await subscribe(product._id, "shopper@example.com");

    const alerts = await StockAlert.find({ product: product._id });
    expect(alerts).toHaveLength(1);
  });

  it("notifies every subscriber and marks them notified when restocked from 0", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);

    const registeredUser = await createUser({ email: "known-shopper@example.com" });
    const product = await createProduct({ stock: 0 });

    await subscribe(product._id, "known-shopper@example.com");
    await subscribe(product._id, "guest-shopper@example.com");

    const res = await restockProduct(adminToken, product, 5);
    expect(res.status).toBe(200);

    // Give the fire-and-forget notifyStockAlertSubscribers a tick to run.
    await new Promise((r) => setTimeout(r, 300));

    const alerts = await StockAlert.find({ product: product._id });
    expect(alerts).toHaveLength(2);
    expect(alerts.every((a) => a.notified === true)).toBe(true);

    // Only the subscriber with a matching registered account gets an
    // in-app notification — a guest email has nowhere to show it.
    const notifications = await Notification.find({ user: registeredUser._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("back_in_stock");
  });

  it("does not re-notify subscribers on an update that doesn't cross 0 -> positive", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);
    // Already in stock — restocking further shouldn't fire the alert.
    const product = await createProduct({ stock: 3 });

    await subscribe(product._id, "shopper@example.com");

    await restockProduct(adminToken, product, 10);
    await new Promise((r) => setTimeout(r, 300));

    const alert = await StockAlert.findOne({ product: product._id });
    expect(alert.notified).toBe(false);
  });
});
