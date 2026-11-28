import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// PR-9b1 owner condition: when updateProduct's transaction is retried
// (a write landed between its read and its write), the audit entry holds
// the diff of the LAST, successful attempt only -- and there is still
// exactly one entry. Runs on a replica set so withTransaction really
// retries, the same way product-stock-baseline.test.js test 7 does.

vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../middleware/imageOptimizer.js", () => ({
  default: (_req, _res, next) => next(),
}));

import "./setup-replset.js";
import app from "../app.js";
import Product from "../models/Product.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const auditCollection = () => mongoose.connection.collection("adminauditlogs");
const allEntries = () => auditCollection().find({}).sort({ createdAt: 1 }).toArray();
const waitForEntries = async (count, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  let entries = await allEntries();
  while (entries.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    entries = await allEntries();
  }
  return entries;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

const saveForm = (token, loaded, overrides = {}) =>
  request(app)
    .put(`/api/products/${loaded._id}`)
    .set("Authorization", `Bearer ${token}`)
    .field("name", loaded.name)
    .field("description", loaded.description)
    .field("price", String(overrides.price ?? loaded.price))
    .field("category", loaded.category.toString())
    .field("stock", String(loaded.stock))
    .field("stockBaseline", String(loaded.stock))
    .field("featured", String(overrides.featured ?? loaded.featured))
    .field("isActive", "true")
    .field("existingImages", JSON.stringify([loaded.image]))
    .field("version", String(loaded.__v));

let token;
beforeEach(async () => {
  token = signToken(await createUser({ role: "admin", name: "Owner Admin" }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PR-9b1: transaction retry", () => {
  it("R1. a retried product save leaves one entry with the final attempt's diff only", async () => {
    const product = await createProduct({ price: 300, stock: 5, featured: false });
    // Normalise once so the form and the stored product agree.
    expect((await saveForm(token, await Product.findById(product._id))).status).toBe(200);
    await waitForEntries(1);
    await auditCollection().deleteMany({});
    const loaded = await Product.findById(product._id);

    // First attempt: another writer sets featured=true just before the
    // save writes, outside the transaction -> write conflict -> retry.
    // The retry reads featured=true, so only its diff shows featured
    // true -> false; the first attempt's diff (no featured change) must
    // not be what gets logged.
    const realSave = Product.prototype.save;
    let firstAttemptError;
    const saveSpy = vi.spyOn(Product.prototype, "save").mockImplementationOnce(async function (...args) {
      await Product.collection.updateOne({ _id: this._id }, { $set: { featured: true } });
      try {
        return await realSave.apply(this, args);
      } catch (error) {
        firstAttemptError = error;
        throw error;
      }
    });

    const res = await saveForm(token, loaded, { price: 250, featured: false });
    expect(res.status).toBe(200);
    expect(firstAttemptError?.errorLabels ?? [...(firstAttemptError?.errorLabelSet ?? [])]).toContain(
      "TransientTransactionError",
    );
    expect(saveSpy.mock.calls.length).toBe(2);

    await waitForEntries(1);
    await settle();
    const entries = await allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].changes).toHaveLength(2);
    expect(entries[0].changes).toEqual(
      expect.arrayContaining([
        { field: "price", from: 300, to: 250 },
        { field: "featured", from: true, to: false },
      ]),
    );
  });
});
