import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Replica set: updateProduct runs its read-modify-save in a transaction,
// and the in-request race below depends on a real write conflict.
import "./setup-replset.js";
import app from "../app.js";
import Product from "../models/Product.js";
import StockAlert from "../models/StockAlert.js";
import { createUser, signToken, createProduct, seedSiteSettings } from "./helpers.js";

// An admin edit form submitted the way EditProduct.jsx sends it: every
// field from the copy the form was loaded with, plus stockBaseline (the
// stock that copy showed) at the top level and on each loaded size row.
const saveForm = (token, loaded, { stock, variants, stockBaseline, ...overrides } = {}) => {
  const req = request(app)
    .put(`/api/products/${loaded._id}`)
    .set("Authorization", `Bearer ${token}`)
    .field("name", overrides.name ?? loaded.name)
    .field("description", overrides.description ?? loaded.description)
    .field("price", String(loaded.price))
    .field("category", loaded.category.toString())
    .field("stock", String(stock ?? loaded.stock))
    .field("existingImages", JSON.stringify([loaded.image]))
    .field("version", String(loaded.__v));
  if (stockBaseline !== null) req.field("stockBaseline", String(stockBaseline ?? loaded.stock));
  if (variants) req.field("variants", JSON.stringify(variants));
  return req;
};

const loadedVariants = (loaded) =>
  loaded.variants.map((v) => ({
    size: v.size,
    price: v.price,
    oldPrice: v.oldPrice,
    stock: v.stock,
    purchasePrice: v.purchasePrice,
    stockBaseline: v.stock,
  }));

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeOrder = async (product, quantity, size) => {
  const customer = await createUser();
  const res = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${signToken(customer)}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: size ? product.variants.find((v) => v.size === size).price : product.price,
          quantity,
          ...(size && { size }),
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
    });
  expect(res.status).toBe(201);
  return res.body.order;
};

const posSale = (token, product, quantity) =>
  request(app)
    .post("/api/admin/pos/sale")
    .set("Authorization", `Bearer ${token}`)
    .field("items", JSON.stringify([{ productId: product._id.toString(), quantity, unitPrice: product.price }]))
    .field("paymentMethod", "Cash");

const sizedProduct = () =>
  createProduct({
    price: 500,
    stock: 9,
    variants: [
      { size: "Single", price: 500, stock: 5 },
      { size: "King", price: 900, stock: 4 },
    ],
  });

let token;

beforeEach(async () => {
  sendEmail.mockClear();
  await seedSiteSettings({ codCharge: 0 });
  token = signToken(await createUser({ role: "admin" }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin product save keeps stock that changed while the form was open", () => {
  it("1. description-only save after an order sold 2 leaves stock at 3", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id); // form opens: 5

    await placeOrder(product, 2); // 5 -> 3

    const res = await saveForm(token, loaded, { description: "New description" });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id);
    expect(after.stock).toBe(3);
    expect(after.description).toBe("New description");
  });

  it("2. an explicit increase is applied on top of a concurrent sale (5 -> 15 with 2 sold = 13)", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id);

    await placeOrder(product, 2);

    const res = await saveForm(token, loaded, { stock: 15 });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(13);
  });

  it("3. sized product: per-size deltas on fresh stock, top-level stays the sum", async () => {
    const product = await sizedProduct();
    const loaded = await Product.findById(product._id); // Single 5, King 4

    await placeOrder(product, 1, "King"); // King 4 -> 3

    const variants = loadedVariants(loaded).map((v) => (v.size === "Single" ? { ...v, stock: 7 } : v));
    const res = await saveForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id);
    const bySize = Object.fromEntries(after.variants.map((v) => [v.size, v.stock]));
    expect(bySize).toEqual({ Single: 7, King: 3 });
    expect(after.stock).toBe(10);
  });

  it("4. a POS sale during the edit is kept", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id);

    const sale = await posSale(token, product, 2);
    expect(sale.status).toBe(201);

    const res = await saveForm(token, loaded, { description: "Edited at the counter" });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(3);
  });

  it("5. a cancellation restock during the edit is kept", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const order = await placeOrder(product, 1); // 5 -> 4
    const loaded = await Product.findById(product._id); // form opens: 4

    const cancel = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Cancelled" });
    expect(cancel.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(5);

    const res = await saveForm(token, loaded, { description: "After cancel" });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it("6. a decrease larger than what's left now is refused with 409 and nothing is written", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id);

    await placeOrder(product, 2); // 3 left

    const res = await saveForm(token, loaded, { stock: 1, description: "Should not save" }); // -4
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);

    const after = await Product.findById(product._id);
    expect(after.stock).toBe(3);
    expect(after.description).toBe(product.description);
  });

  it("7. a sale landing between the save's read and its write is not overwritten (transaction retry)", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id);

    // The first save attempt inside updateProduct: an order's exact $inc
    // commits just before it writes, outside the transaction.
    const realSave = Product.prototype.save;
    let firstAttemptError;
    const saveSpy = vi.spyOn(Product.prototype, "save").mockImplementationOnce(async function (...args) {
      await Product.collection.updateOne({ _id: this._id }, { $inc: { stock: -2 } });
      try {
        return await realSave.apply(this, args);
      } catch (error) {
        firstAttemptError = error;
        throw error;
      }
    });

    const res = await saveForm(token, loaded, { description: "Raced" });
    expect(res.status).toBe(200);
    // The stale first write was refused as a transient write conflict and
    // the whole edit re-ran on fresh stock.
    expect(firstAttemptError?.errorLabels ?? [...(firstAttemptError?.errorLabelSet ?? [])]).toContain(
      "TransientTransactionError",
    );
    expect(saveSpy.mock.calls.length).toBe(2);

    const after = await Product.findById(product._id);
    expect(after.stock).toBe(3);
    expect(after.description).toBe("Raced");
  });

  it("8. adding and removing sizes: new size takes the form stock, kept size keeps its concurrent sale", async () => {
    const product = await sizedProduct();
    const loaded = await Product.findById(product._id);

    await placeOrder(product, 1, "Single"); // Single 5 -> 4

    const variants = [
      ...loadedVariants(loaded).filter((v) => v.size === "Single"),
      { size: "Queen", price: 700, oldPrice: 0, stock: 6, purchasePrice: 0 }, // new row, no baseline
    ];
    const res = await saveForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id);
    const bySize = Object.fromEntries(after.variants.map((v) => [v.size, v.stock]));
    expect(bySize).toEqual({ Single: 4, Queen: 6 });
    expect(after.stock).toBe(10);
  });

  it("8b. duplicate size rows (differing only in case/space): the first wins and its delta applies once", async () => {
    const product = await sizedProduct();
    const loaded = await Product.findById(product._id);

    await placeOrder(product, 1, "King"); // King 4 -> 3

    const [single, king] = loadedVariants(loaded);
    const variants = [single, { ...king, stock: 6 }, { ...king, size: " king ", stock: 9 }]; // +2 on King
    const res = await saveForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id);
    expect(after.variants.map((v) => [v.size, v.stock])).toEqual([
      ["Single", 5],
      ["King", 5],
    ]);
    expect(after.stock).toBe(10);
  });

  it("9. no stockBaseline sent (older client / scripts): stock is set as sent, as before", async () => {
    const product = await createProduct({ price: 300, stock: 5 });
    const loaded = await Product.findById(product._id);

    const res = await saveForm(token, loaded, { stock: 15, stockBaseline: null });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(15);
  });

  it("11a. no back-in-stock email when an out-of-stock product is saved without a stock change", async () => {
    const product = await createProduct({ price: 300, stock: 0 });
    await StockAlert.create({ product: product._id, email: "wants@example.com" });
    const loaded = await Product.findById(product._id);

    const res = await saveForm(token, loaded, { description: "Still out of stock" });
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await StockAlert.findOne({ product: product._id })).notified).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("11b. back-in-stock email fires once on a real 0 -> positive restock", async () => {
    const product = await createProduct({ price: 300, stock: 0 });
    await StockAlert.create({ product: product._id, email: "wants@example.com" });
    const loaded = await Product.findById(product._id);

    const res = await saveForm(token, loaded, { stock: 4 });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(4);

    // The alert is claimed (notified: true) before the email goes out, so
    // wait for the send itself, not just the claim.
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect((await StockAlert.findOne({ product: product._id })).notified).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("11c. sized product: restocking one size doesn't notify a different sold-out size's subscriber", async () => {
    const product = await createProduct({
      price: 500,
      stock: 3,
      variants: [
        { size: "Single", price: 500, stock: 3 },
        { size: "King", price: 900, stock: 0 },
      ],
    });
    await StockAlert.create({ product: product._id, email: "king@example.com", size: "King" });
    const loaded = await Product.findById(product._id);

    const variants = loadedVariants(loaded).map((v) => (v.size === "Single" ? { ...v, stock: 8 } : v));
    const res = await saveForm(token, loaded, { variants });
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await StockAlert.findOne({ product: product._id })).notified).toBe(false);
  });
});
