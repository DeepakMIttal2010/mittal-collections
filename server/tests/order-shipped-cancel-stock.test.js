import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// PR-7 (admin audit OP-01): cancelling an order that already left the shop
// (Shipped/Delivered) must not put its stock back on the site straight away
// -- the parcel is still with the courier or the customer. The order is
// marked "stock return pending" instead, and the admin later records the
// parcel as received (restock, once) or lost (no restock):
//
//   Shipped/Delivered --cancel--> Cancelled + pending
//        pending --received--> restocked once      (final)
//        pending --lost------> no restock          (final)
//
// Everything else a cancellation gives back (points, coupon, referral,
// review bonus, refund-due review) is unchanged and still immediate.

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Cancel and stock-return run in MongoDB transactions -- replica set needed.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import ReturnRequest from "../models/ReturnRequest.js";
import StockAlert from "../models/StockAlert.js";
import Notification from "../models/Notification.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { createUser, signToken, createProduct } from "./helpers.js";

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

let adminToken;
beforeEach(async () => {
  adminToken = signToken(await createUser({ role: "admin" }));
});

const ADDRESS = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201001",
};

// An order already in `status`, its history ending there. Default: one COD
// line of 1 unit, 20 redeemed points and the first-order coupon claimed.
let counter = 0;
const makeOrder = async ({ status = "Shipped", lines, product, isPaid = false, ...overrides } = {}) => {
  counter += 1;
  const customer = await createUser({ loyaltyPoints: 0, firstOrderCouponUsed: true });
  const p = product || (await createProduct({ stock: 4 }));
  const orderItems = lines || [{ product: p._id, name: p.name, image: p.image, price: 999, quantity: 1 }];
  const history = ["Pending", "Processing", "Shipped", "Delivered"];
  const order = await Order.create({
    user: customer._id,
    orderItems,
    shippingAddress: ADDRESS,
    paymentMethod: isPaid ? "Razorpay" : "COD",
    ...(isPaid && {
      isPaid: true,
      paidAt: new Date(),
      razorpayOrderId: `order_pr7_${counter}`,
      razorpayPaymentId: `pay_pr7_${counter}`,
      paymentSource: "verify",
    }),
    totalPrice: 999,
    orderStatus: status,
    statusHistory: history
      .slice(0, history.indexOf(status) + 1)
      .map((s, i) => ({ status: s, changedAt: new Date(Date.now() - (4 - i) * 3600_000) })),
    ...(status === "Delivered" && { deliveredAt: new Date() }),
    pointsRedeemed: 20,
    firstOrderCouponApplied: true,
    ...overrides,
  });
  await LoyaltyTransaction.create({
    user: customer._id,
    type: "redeemed",
    points: -20,
    balanceAfter: 0,
    order: order._id,
    description: `Redeemed on order ${order._id}`,
  });
  return { order, customer, product: p };
};

const cancel = (order, body = {}, token = adminToken) =>
  request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "Cancelled", ...body });

const stockReturn = (order, outcome, token = adminToken) =>
  request(app)
    .put(`/api/orders/${order._id}/stock-return`)
    .set("Authorization", `Bearer ${token}`)
    .send({ outcome });

const stockOf = async (product) => (await Product.findById(product._id)).stock;
const fresh = (order) => Order.findById(order._id).lean();

// Points and coupon come back at cancel time, whatever the stock does.
const expectPointsAndCouponBack = async (customer) => {
  const user = await User.findById(customer._id);
  expect(user.loyaltyPoints).toBe(20);
  expect(user.firstOrderCouponUsed).toBe(false);
};

describe("PR-7: cancelling an order that already left the shop", () => {
  it("1. Shipped COD -> Cancelled: stock stays out, return pending, points and coupon back", async () => {
    const setup = await makeOrder({ status: "Shipped" });

    const res = await cancel(setup.order);

    expect(res.status).toBe(200);
    const after = await fresh(setup.order);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.stockReturnPending).toBe(true);
    expect(after.stockReturnOutcome ?? null).toBeNull();
    expect(await stockOf(setup.product)).toBe(4);
    await expectPointsAndCouponBack(setup.customer);
  });

  it("2. Delivered -> Cancelled: same, stock stays out until the parcel is back", async () => {
    const setup = await makeOrder({ status: "Delivered" });

    const res = await cancel(setup.order);

    expect(res.status).toBe(200);
    const after = await fresh(setup.order);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.stockReturnPending).toBe(true);
    expect(await stockOf(setup.product)).toBe(4);
    await expectPointsAndCouponBack(setup.customer);
  });

  it("3. Shipped PAID order: refund-due review still opens exactly as before, stock pending", async () => {
    const setup = await makeOrder({ status: "Shipped", isPaid: true });

    const unconfirmed = await cancel(setup.order);
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.code).toBe("PAID_CANCEL_CONFIRM_REQUIRED");

    const res = await cancel(setup.order, { confirmPaidCancellation: true });

    expect(res.status).toBe(200);
    const after = await fresh(setup.order);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("paid_order_cancelled");
    expect(after.stockReturnPending).toBe(true);
    expect(await stockOf(setup.product)).toBe(4);
  });

  it("4. guard: Processing -> Cancelled still restocks at once and is never pending", async () => {
    const setup = await makeOrder({ status: "Processing" });

    const res = await cancel(setup.order);

    expect(res.status).toBe(200);
    const after = await fresh(setup.order);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.stockReturnPending).not.toBe(true);
    expect(await stockOf(setup.product)).toBe(5);
    await expectPointsAndCouponBack(setup.customer);
  });

  it("5. guard: an order cancelled before this change is not made pending, and cannot be 'received'", async () => {
    // Cancelled from Shipped under the old rule: its stock already came back.
    const legacy = await makeOrder({ status: "Shipped" });
    await Order.updateOne(
      { _id: legacy.order._id },
      {
        $set: { orderStatus: "Cancelled", cancelledAt: new Date(), cancellationReason: "admin" },
        $push: { statusHistory: { status: "Cancelled", changedAt: new Date() } },
      },
    );

    const other = await makeOrder({ status: "Shipped" });
    await cancel(other.order);

    expect((await fresh(legacy.order)).stockReturnPending).not.toBe(true);
    const res = await stockReturn(legacy.order, "received");
    expect(res.status).toBe(400);
    expect(await stockOf(legacy.product)).toBe(4);
  });
});

describe("PR-7: recording the parcel as received", () => {
  it("6. received: restocks once, closes the pending state with outcome and time", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const res = await stockReturn(setup.order, "received");

    expect(res.status).toBe(200);
    expect(await stockOf(setup.product)).toBe(5);
    const after = await fresh(setup.order);
    expect(after.stockReturnPending).toBe(false);
    expect(after.stockReturnOutcome).toBe("received");
    expect(after.stockReturnResolvedAt).toBeInstanceOf(Date);
    expect(after.stockReturnResolvedBy).toBeTruthy();
  });

  it("7. received twice: second call refused, stock unchanged", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);
    await stockReturn(setup.order, "received");

    const again = await stockReturn(setup.order, "received");

    expect(again.status).toBe(400);
    expect(await stockOf(setup.product)).toBe(5);
  });

  it("8. two concurrent 'received' calls restock exactly once", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const results = await Promise.all([
      stockReturn(setup.order, "received"),
      stockReturn(setup.order, "received"),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => [400, 409].includes(r.status))).toBe(true);
    expect(await stockOf(setup.product)).toBe(5);
  });

  it("9. concurrent 'received' and 'lost': only one wins, stock matches the winner", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const [received, lost] = await Promise.all([
      stockReturn(setup.order, "received"),
      stockReturn(setup.order, "lost"),
    ]);

    expect([received.status, lost.status].filter((s) => s === 200)).toHaveLength(1);
    const after = await fresh(setup.order);
    expect(after.stockReturnPending).toBe(false);
    expect(await stockOf(setup.product)).toBe(after.stockReturnOutcome === "received" ? 5 : 4);
  });

  it("10. quantity already back through a return is not restocked a second time", async () => {
    const product = await createProduct({ stock: 4 });
    const setup = await makeOrder({
      status: "Delivered",
      product,
      lines: [{ product: product._id, name: product.name, image: product.image, price: 500, quantity: 3 }],
    });
    // 1 of the 3 already came back (and was restocked) through a return.
    await ReturnRequest.create({
      order: setup.order._id,
      user: setup.customer._id,
      product: product._id,
      productName: product.name,
      quantity: 1,
      reason: "Damaged",
      status: "Refunded",
      stockRestored: true,
      stockRestoredAt: new Date(),
    });
    await Product.updateOne({ _id: product._id }, { $inc: { stock: 1 } }); // 5

    await cancel(setup.order);
    expect(await stockOf(product)).toBe(5);

    const res = await stockReturn(setup.order, "received");

    expect(res.status).toBe(200);
    expect(await stockOf(product)).toBe(7); // the 2 still out, not all 3
  });

  it("11. a size line restocks that size and the product total", async () => {
    const product = await createProduct({
      stock: 3,
      variants: [
        { size: "90x90", price: 999, stock: 1 },
        { size: "90x108", price: 1199, stock: 2 },
      ],
    });
    const setup = await makeOrder({
      status: "Shipped",
      product,
      lines: [{ product: product._id, name: product.name, image: product.image, price: 1199, quantity: 2, size: "90x108" }],
    });
    await cancel(setup.order);

    const res = await stockReturn(setup.order, "received");

    expect(res.status).toBe(200);
    const after = await Product.findById(product._id).lean();
    expect(after.stock).toBe(5);
    expect(after.variants.find((v) => v.size === "90x108").stock).toBe(4);
    expect(after.variants.find((v) => v.size === "90x90").stock).toBe(1);
  });

  it("12. a product deleted meanwhile: whole receive rolls back, nothing restocked, still pending", async () => {
    const kept = await createProduct({ stock: 0 });
    const gone = await createProduct({ stock: 2 });
    await StockAlert.create({ product: kept._id, email: "watcher-12@example.com" });
    const setup = await makeOrder({
      status: "Shipped",
      product: kept,
      lines: [
        { product: kept._id, name: kept.name, image: kept.image, price: 999, quantity: 1 },
        { product: gone._id, name: gone.name, image: gone.image, price: 999, quantity: 1 },
      ],
    });
    await cancel(setup.order);
    await Product.deleteOne({ _id: gone._id });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await stockReturn(setup.order, "received");

    expect(res.status).toBe(409);
    expect(await stockOf(kept)).toBe(0);
    const after = await fresh(setup.order);
    expect(after.stockReturnPending).toBe(true);
    expect(after.stockReturnOutcome ?? null).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await StockAlert.findOne({ product: kept._id })).notified).not.toBe(true);
  });

  it("13. back-in-stock alert goes out once, only after the receive commits", async () => {
    const product = await createProduct({ stock: 0 });
    const watcher = await createUser({ email: "watcher-13@example.com" });
    await StockAlert.create({ product: product._id, email: watcher.email });
    const setup = await makeOrder({ status: "Shipped", product });
    await cancel(setup.order);

    // Cancelling alone must not announce stock that is not on the shelf.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await Notification.countDocuments({ user: watcher._id, type: "back_in_stock" })).toBe(0);

    expect((await stockReturn(setup.order, "received")).status).toBe(200);
    await vi.waitFor(async () =>
      expect(await Notification.countDocuments({ user: watcher._id, type: "back_in_stock" })).toBe(1),
    );

    await stockReturn(setup.order, "received");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await Notification.countDocuments({ user: watcher._id, type: "back_in_stock" })).toBe(1);
  });
});

describe("PR-7: recording the parcel as lost", () => {
  it("14. lost: no restock, pending closed as lost; 'received' afterwards is refused", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const res = await stockReturn(setup.order, "lost");

    expect(res.status).toBe(200);
    expect(await stockOf(setup.product)).toBe(4);
    const after = await fresh(setup.order);
    expect(after.stockReturnPending).toBe(false);
    expect(after.stockReturnOutcome).toBe("lost");
    expect(after.stockReturnResolvedAt).toBeInstanceOf(Date);

    const late = await stockReturn(setup.order, "received");
    expect(late.status).toBe(400);
    expect(await stockOf(setup.product)).toBe(4);
  });
});

describe("PR-7: guards", () => {
  it("15. stock-return refused for: an order never pending, a bad outcome, a non-admin", async () => {
    const processing = await makeOrder({ status: "Processing" });
    await cancel(processing.order);
    expect((await stockReturn(processing.order, "received")).status).toBe(400);
    expect(await stockOf(processing.product)).toBe(5);

    const shipped = await makeOrder({ status: "Shipped" });
    await cancel(shipped.order);
    expect((await stockReturn(shipped.order, "maybe")).status).toBe(400);
    expect((await stockReturn(shipped.order, { $ne: null })).status).toBe(400);

    const asCustomer = await stockReturn(shipped.order, "received", signToken(shipped.customer));
    expect([401, 403]).toContain(asCustomer.status);

    expect((await fresh(shipped.order)).stockReturnPending).toBe(true);
    expect(await stockOf(shipped.product)).toBe(4);
  });

  it("16. a pending order cannot be deleted (soft or permanent) until the parcel is settled", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const soft = await request(app).delete(`/api/orders/${setup.order._id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(soft.status).toBe(400);
    expect((await fresh(setup.order)).isActive).not.toBe(false);

    // Even if it was hidden some other way, the record is not removed.
    await Order.updateOne({ _id: setup.order._id }, { $set: { isActive: false } });
    const permanent = await request(app)
      .delete(`/api/orders/${setup.order._id}/permanent`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(permanent.status).toBe(400);
    expect(await Order.exists({ _id: setup.order._id })).toBeTruthy();

    // Once settled, deleting works as before.
    await Order.updateOne({ _id: setup.order._id }, { $set: { isActive: true } });
    expect((await stockReturn(setup.order, "received")).status).toBe(200);
    const after = await request(app).delete(`/api/orders/${setup.order._id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(after.status).toBe(200);
  });

  it("17. guard: the customer cannot open a new return on the cancelled order", async () => {
    const setup = await makeOrder({ status: "Delivered" });
    await cancel(setup.order);

    const res = await request(app)
      .post("/api/returns")
      .set("Authorization", `Bearer ${signToken(setup.customer)}`)
      .send({ orderId: String(setup.order._id), productId: String(setup.product._id), quantity: 1, reason: "Changed my mind" });

    expect(res.status).toBe(400);
    expect(await ReturnRequest.countDocuments({ order: setup.order._id })).toBe(0);
  });

  it("19. an unpaid Razorpay order cancelled after shipping cannot be revived as COD while its parcel is out", async () => {
    const setup = await makeOrder({
      status: "Shipped",
      paymentMethod: "Razorpay",
      razorpayOrderId: "order_pr7_convert",
      pointsRedeemed: 0,
      firstOrderCouponApplied: false,
    });
    await cancel(setup.order);

    const res = await request(app)
      .put(`/api/orders/${setup.order._id}/convert-to-cod`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parcel/i);
    const after = await fresh(setup.order);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.paymentMethod).toBe("Razorpay");
    expect(after.stockReturnPending).toBe(true);
    expect(await stockOf(setup.product)).toBe(4);
  });

  it("18. pending parcels are visible in the admin order list", async () => {
    const setup = await makeOrder({ status: "Shipped" });
    await cancel(setup.order);

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const listed = (res.body.orders || []).find((o) => o._id === String(setup.order._id));
    expect(listed).toMatchObject({ orderStatus: "Cancelled", stockReturnPending: true });
  });
});
