import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import OfflineSale from "../models/OfflineSale.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { createUser, signToken, createProduct, seedLoyaltySettings } from "./helpers.js";

// Both /sale and /sales/:id sit behind upload.single("paymentProof") —
// send as multipart fields (no file), same pattern
// product-version-conflict.test.js already uses for a multer-guarded route.
const saleRequest = (method, url, token, { items, ...fields }) => {
  const req = request(app)[method](url).set("Authorization", `Bearer ${token}`);

  req.field("items", JSON.stringify(items));
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) req.field(key, String(value));
  }

  return req;
};

const recordSale = (token, { productId, quantity = 1, unitPrice, size, ...rest }) =>
  saleRequest("post", "/api/admin/pos/sale", token, {
    items: [{ productId, quantity, unitPrice, size }],
    paymentMethod: "Cash",
    ...rest,
  });

describe("PUT /api/admin/pos/sales/:id — edit", () => {
  it("adjusts stock by the delta when quantity changes", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 20 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 2,
      unitPrice: 100,
    });
    expect(created.status).toBe(201);
    expect((await Product.findById(product._id)).stock).toBe(18);

    const edited = await saleRequest(
      "put",
      `/api/admin/pos/sales/${created.body.sale._id}`,
      token,
      {
        items: [{ productId: product._id.toString(), quantity: 5, unitPrice: 100 }],
        paymentMethod: "Cash",
      },
    );

    expect(edited.status).toBe(200);
    expect(edited.body.sale.totalAmount).toBe(500);
    // 20 - 5 (new quantity), not 20 - 2 - 5 -- the original 2 were put
    // back before the new 5 were reserved.
    expect((await Product.findById(product._id)).stock).toBe(15);
  });

  it("re-reserves the original items and fails cleanly when the edited quantity exceeds available stock", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 5 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 2,
      unitPrice: 100,
    });
    expect((await Product.findById(product._id)).stock).toBe(3);

    const edited = await saleRequest(
      "put",
      `/api/admin/pos/sales/${created.body.sale._id}`,
      token,
      {
        items: [{ productId: product._id.toString(), quantity: 999, unitPrice: 100 }],
        paymentMethod: "Cash",
      },
    );

    expect(edited.status).toBe(400);
    // Stock ends up back where it was before the edit attempt, not
    // stuck mid-restore.
    expect((await Product.findById(product._id)).stock).toBe(3);
    const unchanged = await OfflineSale.findById(created.body.sale._id);
    expect(unchanged.items[0].quantity).toBe(2);
  });

  it("reconciles loyalty points when the edited total changes", async () => {
    await seedLoyaltySettings({ earnRate: 20 }); // 1 point per ₹20
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const customer = await createUser({ mobile: "9111111111" });
    const product = await createProduct({ price: 100, stock: 50 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 2,
      unitPrice: 100,
      customerMobile: customer.mobile,
    });
    expect(created.body.sale.loyaltyPointsAwarded).toBe(10); // 200/20

    await saleRequest("put", `/api/admin/pos/sales/${created.body.sale._id}`, token, {
      items: [{ productId: product._id.toString(), quantity: 4, unitPrice: 100 }],
      paymentMethod: "Cash",
      customerMobile: customer.mobile,
    });

    const updatedCustomer = await User.findById(customer._id);
    // Net effect of clawback(-10) + earn(+20) on a customer who started
    // at 0 loyalty points.
    expect(updatedCustomer.loyaltyPoints).toBe(20);

    const transactions = await LoyaltyTransaction.find({ user: customer._id }).sort({
      createdAt: 1,
    });
    expect(transactions.map((t) => t.type)).toEqual(["earned", "clawback", "earned"]);
  });

  it("refuses to edit an already-voided sale", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 10 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 1,
      unitPrice: 100,
    });
    await request(app)
      .post(`/api/admin/pos/sales/${created.body.sale._id}/void`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const edited = await saleRequest(
      "put",
      `/api/admin/pos/sales/${created.body.sale._id}`,
      token,
      {
        items: [{ productId: product._id.toString(), quantity: 1, unitPrice: 100 }],
        paymentMethod: "Cash",
      },
    );

    expect(edited.status).toBe(400);
    expect(edited.body.message).toMatch(/voided sale/i);
  });

  it("rejects a NoSQL-injection-shaped productId instead of querying with it", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 10 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 1,
      unitPrice: 100,
    });

    const res = await request(app)
      .put(`/api/admin/pos/sales/${created.body.sale._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("items", JSON.stringify([{ productId: { $gt: "" }, quantity: 1, unitPrice: 100 }]))
      .field("paymentMethod", "Cash");

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/pos/sales/:id", () => {
  it("restores stock and claws back loyalty for an active sale before deleting it", async () => {
    await seedLoyaltySettings({ earnRate: 20 });
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const customer = await createUser({ mobile: "9222222222" });
    const product = await createProduct({ price: 100, stock: 10 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 3,
      unitPrice: 100,
      customerMobile: customer.mobile,
    });
    expect((await Product.findById(product._id)).stock).toBe(7);
    expect((await User.findById(customer._id)).loyaltyPoints).toBe(15);

    const res = await request(app)
      .delete(`/api/admin/pos/sales/${created.body.sale._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(10);
    expect((await User.findById(customer._id)).loyaltyPoints).toBe(0);
    expect(await OfflineSale.findById(created.body.sale._id)).toBeNull();
  });

  it("does not double-restore stock when deleting a sale that was already voided", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 10 });

    const created = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 3,
      unitPrice: 100,
    });
    await request(app)
      .post(`/api/admin/pos/sales/${created.body.sale._id}/void`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect((await Product.findById(product._id)).stock).toBe(10);

    await request(app)
      .delete(`/api/admin/pos/sales/${created.body.sale._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect((await Product.findById(product._id)).stock).toBe(10);
  });

  it("404s for a sale that doesn't exist", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const res = await request(app)
      .delete("/api/admin/pos/sales/64b1012f520803c42433e999")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/pos/sales — filters and summary", () => {
  it("filters by payment method and status, and the summary reflects only the filtered set", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 100 });

    const cashSale = await recordSale(token, {
      productId: product._id.toString(),
      quantity: 1,
      unitPrice: 100,
    });
    await saleRequest("post", "/api/admin/pos/sale", token, {
      items: [{ productId: product._id.toString(), quantity: 2, unitPrice: 100 }],
      paymentMethod: "UPI",
    });
    await request(app)
      .post(`/api/admin/pos/sales/${cashSale.body.sale._id}/void`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const cashOnly = await request(app)
      .get("/api/admin/pos/sales?paymentMethod=Cash")
      .set("Authorization", `Bearer ${token}`);
    const activeOnly = await request(app)
      .get("/api/admin/pos/sales?status=active")
      .set("Authorization", `Bearer ${token}`);

    expect(cashOnly.body.sales).toHaveLength(1);
    expect(activeOnly.body.sales).toHaveLength(1);
    expect(activeOnly.body.summary.activeCount).toBe(1);
    expect(activeOnly.body.summary.voidedCount).toBe(0);
    expect(activeOnly.body.summary.totalRevenue).toBe(200); // the UPI sale only
  });

  it("search matches customer/staff/product text, case-insensitively, without breaking on regex metacharacters", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const product = await createProduct({ price: 100, stock: 100, name: "Anti-Slip (Doormat)" });

    await recordSale(token, {
      productId: product._id.toString(),
      quantity: 1,
      unitPrice: 100,
      customerName: "Rakesh Kumar",
    });

    const byProduct = await request(app)
      .get("/api/admin/pos/sales?q=" + encodeURIComponent("anti-slip (doormat)"))
      .set("Authorization", `Bearer ${token}`);
    const byCustomer = await request(app)
      .get("/api/admin/pos/sales?q=RAKESH")
      .set("Authorization", `Bearer ${token}`);

    expect(byProduct.status).toBe(200);
    expect(byProduct.body.sales).toHaveLength(1);
    expect(byCustomer.body.sales).toHaveLength(1);
  });

  it("blocks a non-admin from every POS sales-management action", async () => {
    const customer = await createUser();
    const token = signToken(customer);

    const list = await request(app)
      .get("/api/admin/pos/sales")
      .set("Authorization", `Bearer ${token}`);
    const del = await request(app)
      .delete("/api/admin/pos/sales/64b1012f520803c42433e999")
      .set("Authorization", `Bearer ${token}`);

    expect(list.status).toBe(403);
    expect(del.status).toBe(403);
  });
});
