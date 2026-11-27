import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import SiteSettings from "../models/SiteSettings.js";
import { createUser, signToken, createProduct, seedLoyaltySettings, seedSiteSettings } from "./helpers.js";

// My Orders -> Cancel/Return audit 2026-11-27, OR-02.
// Whether an item can be returned, and for how many days, was read from the
// product as it is NOW, while the returns policy promises the terms "at the
// time of purchase". Each order line now keeps the terms it was sold with:
//   isReturnable      the product's setting at checkout
//   returnPeriodDays  the window in force at checkout (the product's own
//                     override, else the site default at that time)
// and My Orders, the return request and the points wait all read them.
// Orders placed before this change have neither and keep reading the
// current product.

const DAY = 24 * 60 * 60 * 1000;

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

let adminToken;

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({});
  await seedLoyaltySettings({ earnRate: 20, redeemValue: 1, maxRedeemPercent: 0.1 });
  await seedSiteSettings({ codCharge: 0, defaultReturnPeriodDays: 7 });
  adminToken = signToken(await createUser({ role: "admin" }));
});

const placeOrder = async (user, products) => {
  const res = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send({
      orderItems: products.map((product) => ({
        product: product._id.toString(),
        name: product.name,
        price: product.price,
        quantity: 1,
      })),
      shippingAddress,
      paymentMethod: "COD",
    });
  expect(res.status).toBe(201);
  return res.body.order;
};

// Delivered `daysAgo` days ago, without going through the status flow.
const markDelivered = (orderId, daysAgo) =>
  Order.updateOne(
    { _id: orderId },
    { $set: { orderStatus: "Delivered", deliveredAt: new Date(Date.now() - daysAgo * DAY) } },
  );

const myLine = async (user, orderId) => {
  const res = await request(app).get("/api/orders/myorders").set("Authorization", `Bearer ${signToken(user)}`);
  expect(res.status).toBe(200);
  return res.body.orders.find((o) => o._id === String(orderId)).orderItems[0];
};

const askReturn = (user, orderId, product) =>
  request(app)
    .post("/api/returns")
    .set("Authorization", `Bearer ${signToken(user)}`)
    .send({ orderId: String(orderId), productId: String(product._id), quantity: 1, reason: "Wrong size" });

describe("OR-02: each order line keeps the return terms it was sold with", () => {
  it("T1 checkout saves isReturnable and the window in force on each line", async () => {
    const user = await createUser();
    const ownWindow = await createProduct({ price: 500, stock: 5, returnPeriodDays: 10 });
    const siteDefault = await createProduct({ price: 500, stock: 5 });
    const finalSale = await createProduct({ price: 500, stock: 5, isReturnable: false });

    const placed = await placeOrder(user, [ownWindow, siteDefault, finalSale]);
    const order = await Order.findById(placed._id).lean();
    const byProduct = new Map(order.orderItems.map((item) => [String(item.product), item]));

    expect(byProduct.get(String(ownWindow._id))).toMatchObject({ isReturnable: true, returnPeriodDays: 10 });
    // 0 on the product = the site default, saved as the number it was then.
    expect(byProduct.get(String(siteDefault._id))).toMatchObject({ isReturnable: true, returnPeriodDays: 7 });
    // A final-sale line still carries a window, so its saved terms are
    // complete (and stay final sale if the product changes later).
    expect(byProduct.get(String(finalSale._id))).toMatchObject({ isReturnable: false, returnPeriodDays: 7 });
  });

  it("T1b no site settings on record: the line saves 7 days, the same fallback the return request uses", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    // A settings document without the field still reads as 7 (the schema
    // default fills it in), so only a missing document reaches `|| 7`.
    await SiteSettings.deleteMany({});
    expect(await SiteSettings.countDocuments()).toBe(0);

    const placed = await placeOrder(user, [product]);
    const order = await Order.findById(placed._id).lean();
    expect(order.orderItems[0]).toMatchObject({ isReturnable: true, returnPeriodDays: 7 });
  });

  it("T2 product made non-returnable after the sale: the item can still be returned", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 2);
    await Product.updateOne({ _id: product._id }, { $set: { isReturnable: false } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.isReturnable).toBe(true);
    expect(line.returnInfo.eligible).toBe(true);
    expect((await askReturn(user, placed._id, product)).status).toBe(201);
  });

  it("T3 product made returnable after a final-sale purchase: still not returnable", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5, isReturnable: false });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 2);
    await Product.updateOne({ _id: product._id }, { $set: { isReturnable: true } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.isReturnable).toBe(false);
    expect(line.returnInfo.eligible).toBe(false);
    const res = await askReturn(user, placed._id, product);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This product is not eligible for return");
  });

  it("T4 product window shortened after the sale (10 -> 3 days), delivered 5 days ago: still inside the 10", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5, returnPeriodDays: 10 });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 5);
    await Product.updateOne({ _id: product._id }, { $set: { returnPeriodDays: 3 } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.periodDays).toBe(10);
    expect(line.returnInfo.eligible).toBe(true);
    expect((await askReturn(user, placed._id, product)).status).toBe(201);
  });

  it("T5 site default shortened after the sale (7 -> 3 days), delivered 5 days ago: still inside the 7", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 5);
    await SiteSettings.updateOne({}, { $set: { defaultReturnPeriodDays: 3 } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.periodDays).toBe(7);
    expect(line.returnInfo.eligible).toBe(true);
    expect((await askReturn(user, placed._id, product)).status).toBe(201);
  });

  it("T6 window lengthened after the sale (7 -> 10 days), delivered 8 days ago: closed, as sold", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 8);
    await Product.updateOne({ _id: product._id }, { $set: { returnPeriodDays: 10 } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.periodDays).toBe(7);
    expect(line.returnInfo.eligible).toBe(false);
    const res = await askReturn(user, placed._id, product);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("The return window for this item has closed");
  });

  it("T7 the points wait follows the terms sold with, not later product edits", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5, returnPeriodDays: 10 });
    const finalSale = await createProduct({ price: 500, stock: 5, isReturnable: false });

    const windowed = await placeOrder(user, [product]);
    const final = await placeOrder(user, [finalSale]);
    // Both edited before delivery, which is when the wait is worked out.
    await Product.updateOne({ _id: product._id }, { $set: { returnPeriodDays: 3 } });
    await Product.updateOne({ _id: finalSale._id }, { $set: { isReturnable: true } });

    for (const { _id } of [windowed, final]) {
      const res = await request(app)
        .put(`/api/orders/${_id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "Delivered" });
      expect(res.status).toBe(200);
    }
    const w = await Order.findById(windowed._id);
    expect(w.pointsAvailableAt.getTime() - w.deliveredAt.getTime()).toBe(10 * DAY);
    const f = await Order.findById(final._id);
    expect(f.pointsAvailableAt.getTime()).toBe(f.deliveredAt.getTime());
  });

  it("T8 guard: an order from before this change (no saved terms) still reads the current product", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    // As an older order: no terms on the line.
    await Order.collection.updateOne(
      { _id: new Order.base.Types.ObjectId(placed._id) },
      { $unset: { "orderItems.$[].isReturnable": "", "orderItems.$[].returnPeriodDays": "" } },
    );
    await markDelivered(placed._id, 2);
    await Product.updateOne({ _id: product._id }, { $set: { isReturnable: false } });

    const line = await myLine(user, placed._id);
    expect(line.returnInfo.isReturnable).toBe(false);
    expect(line.returnInfo.eligible).toBe(false);
    expect((await askReturn(user, placed._id, product)).status).toBe(400);
  });

  it("T9 guard: an older order inside the current product window can still be returned", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    await Order.collection.updateOne(
      { _id: new Order.base.Types.ObjectId(placed._id) },
      { $unset: { "orderItems.$[].isReturnable": "", "orderItems.$[].returnPeriodDays": "" } },
    );
    await markDelivered(placed._id, 2);

    const line = await myLine(user, placed._id);
    expect(line.returnInfo).toMatchObject({ isReturnable: true, periodDays: 7, eligible: true });
    expect((await askReturn(user, placed._id, product)).status).toBe(201);
  });

  it("T10 guard: a deleted product is still refused by the return request, saved terms or not", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 500, stock: 5 });
    const placed = await placeOrder(user, [product]);
    await markDelivered(placed._id, 2);
    await Product.deleteOne({ _id: product._id });

    const res = await askReturn(user, placed._id, product);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This product is not eligible for return");
  });
});
