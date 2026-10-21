import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import OrderCost from "../models/OrderCost.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct, createOrder, seedSiteSettings } from "./helpers.js";

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

const placeOrder = async (user, product, overrides = {}) => {
  await seedSiteSettings({ codCharge: 0 });

  return request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 1,
          ...overrides,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
    });
};

const adminAuth = async () => {
  const admin = await createUser({ role: "admin" });
  return { Authorization: `Bearer ${signToken(admin)}` };
};

describe("order cost snapshot (createOrder)", () => {
  it("snapshots the product's purchase price and misc expenses on the order", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, purchasePrice: 175, miscExpenses: 18, stock: 5 });

    const res = await placeOrder(user, product);
    expect(res.status).toBe(201);

    const cost = await OrderCost.findOne({ order: res.body.order._id });
    expect(cost).not.toBeNull();
    expect(cost.items).toHaveLength(1);
    expect(cost.items[0].unitPurchasePrice).toBe(175);
    expect(cost.items[0].unitMiscExpenses).toBe(18);
    expect(cost.courierCharge).toBeNull();
  });

  it("keeps the snapshot when the product's cost changes afterwards", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, purchasePrice: 175, miscExpenses: 18, stock: 5 });

    const res = await placeOrder(user, product);
    await Product.updateOne({ _id: product._id }, { purchasePrice: 999, miscExpenses: 99 });

    const cost = await OrderCost.findOne({ order: res.body.order._id });
    expect(cost.items[0].unitPurchasePrice).toBe(175);
    expect(cost.items[0].unitMiscExpenses).toBe(18);
  });

  it("uses the purchased variant's own purchase price", async () => {
    const user = await createUser();
    const product = await createProduct({
      price: 500,
      purchasePrice: 100,
      miscExpenses: 10,
      variants: [
        { size: "7x4", price: 500, stock: 5, purchasePrice: 200 },
        { size: "9x4", price: 700, stock: 5, purchasePrice: 300 },
      ],
    });

    const res = await placeOrder(user, product, { size: "9x4", price: 700 });
    expect(res.status).toBe(201);

    const cost = await OrderCost.findOne({ order: res.body.order._id });
    expect(cost.items[0].size).toBe("9x4");
    expect(cost.items[0].unitPurchasePrice).toBe(300);
    expect(cost.items[0].unitMiscExpenses).toBe(10);
  });

  it("never leaks cost fields in any customer-facing order response", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, purchasePrice: 175, miscExpenses: 18, stock: 5 });

    const created = await placeOrder(user, product);
    const orderId = created.body.order._id;
    const auth = { Authorization: `Bearer ${signToken(user)}` };

    const mine = await request(app).get("/api/orders/myorders").set(auth);
    const one = await request(app).get(`/api/orders/${orderId}`).set(auth);

    for (const body of [created.body, mine.body, one.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/unitPurchasePrice|unitMiscExpenses|purchasePrice|miscExpenses|courierCharge/);
    }
  });
});

describe("GET/PUT /api/orders/:id/cost", () => {
  it("rejects a normal customer and an unauthenticated request", async () => {
    const user = await createUser();
    const product = await createProduct({ purchasePrice: 175, miscExpenses: 18, stock: 5 });
    const created = await placeOrder(user, product);
    const id = created.body.order._id;

    const anon = await request(app).get(`/api/orders/${id}/cost`);
    expect(anon.status).toBe(401);

    const customer = await request(app)
      .get(`/api/orders/${id}/cost`)
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(customer.status).toBe(403);

    const customerPut = await request(app)
      .put(`/api/orders/${id}/cost`)
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ courierCharge: 1 });
    expect(customerPut.status).toBe(403);
    expect((await OrderCost.findOne({ order: id })).courierCharge).toBeNull();
  });

  it("rejects a staff account whose role lacks the reports permission", async () => {
    const user = await createUser();
    const product = await createProduct({ purchasePrice: 175, miscExpenses: 18, stock: 5 });
    const created = await placeOrder(user, product);
    const id = created.body.order._id;

    const role = await Role.create({ name: "Orders only", permissions: ["orders"], writeAccess: ["orders:modified"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });
    const auth = { Authorization: `Bearer ${signToken(staff)}` };

    expect((await request(app).get(`/api/orders/${id}/cost`).set(auth)).status).toBe(403);
    expect((await request(app).put(`/api/orders/${id}/cost`).set(auth).send({ courierCharge: 84 })).status).toBe(403);
  });

  it("returns the snapshot with derived totals to an admin", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, purchasePrice: 175, miscExpenses: 18, stock: 5 });
    const created = await placeOrder(user, product);

    const res = await request(app)
      .get(`/api/orders/${created.body.order._id}/cost`)
      .set(await adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.cost.productCost).toBe(175);
    expect(res.body.cost.miscCost).toBe(18);
    expect(res.body.cost.courierCharge).toBeNull();
  });

  it("sets, updates and clears the courier charge, and validates it", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, purchasePrice: 175, miscExpenses: 18, stock: 5 });
    const created = await placeOrder(user, product);
    const id = created.body.order._id;
    const auth = await adminAuth();

    const set = await request(app).put(`/api/orders/${id}/cost`).set(auth).send({ courierCharge: 84, courierNote: "  Delhivery  " });
    expect(set.status).toBe(200);
    expect(set.body.cost.courierCharge).toBe(84);
    expect(set.body.cost.courierNote).toBe("Delhivery");
    expect(set.body.cost.productCost).toBe(175);

    // (NaN can't be sent over JSON -- it serializes to null, which is the
    // "clear the charge" case tested below.)
    for (const bad of [-1, "84", 1e9, {}, [], true]) {
      const res = await request(app).put(`/api/orders/${id}/cost`).set(auth).send({ courierCharge: bad });
      expect(res.status).toBe(400);
    }
    expect((await OrderCost.findOne({ order: id })).courierCharge).toBe(84);

    const zero = await request(app).put(`/api/orders/${id}/cost`).set(auth).send({ courierCharge: 0 });
    expect(zero.body.cost.courierCharge).toBe(0);

    const cleared = await request(app).put(`/api/orders/${id}/cost`).set(auth).send({ courierCharge: null });
    expect(cleared.body.cost.courierCharge).toBeNull();

    const empty = await request(app).put(`/api/orders/${id}/cost`).set(auth).send({});
    expect(empty.status).toBe(400);
  });

  it("returns 404 for an unknown order and 400 for a malformed id", async () => {
    const auth = await adminAuth();

    const missing = await request(app).put("/api/orders/64b000000000000000000000/cost").set(auth).send({ courierCharge: 5 });
    expect(missing.status).toBe(404);

    const bad = await request(app).get("/api/orders/not-an-id/cost").set(auth);
    expect(bad.status).toBe(400);
  });

  it("backfills an older order without a snapshot, and never overwrites an existing one", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 320, stock: 5 });
    const order = await createOrder({ user, products: [product], overrides: { orderStatus: "Shipped" } });
    const auth = await adminAuth();

    expect(await OrderCost.findOne({ order: order._id })).toBeNull();

    const noItems = await request(app).put(`/api/orders/${order._id}/cost`).set(auth).send({ courierCharge: 84 });
    expect(noItems.status).toBe(400);
    expect(await OrderCost.findOne({ order: order._id })).toBeNull();

    const wrongLength = await request(app)
      .put(`/api/orders/${order._id}/cost`)
      .set(auth)
      .send({ courierCharge: 84, itemCosts: [] });
    expect(wrongLength.status).toBe(400);

    const ok = await request(app)
      .put(`/api/orders/${order._id}/cost`)
      .set(auth)
      .send({ courierCharge: 84, itemCosts: [{ unitPurchasePrice: 175, unitMiscExpenses: 18 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.cost.productCost).toBe(175);
    expect(ok.body.cost.miscCost).toBe(18);
    expect(ok.body.cost.courierCharge).toBe(84);

    const again = await request(app)
      .put(`/api/orders/${order._id}/cost`)
      .set(auth)
      .send({ courierCharge: 90, itemCosts: [{ unitPurchasePrice: 1, unitMiscExpenses: 1 }] });
    expect(again.status).toBe(200);
    expect(again.body.cost.courierCharge).toBe(90);
    expect(again.body.cost.productCost).toBe(175);
    expect(again.body.cost.miscCost).toBe(18);

    expect(await Order.countDocuments({})).toBe(1);
  });
});
