import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

// The admin Cancel and the return's stock/points changes run in MongoDB
// transactions — replica set needed, so the races below are real ones.
import "./setup-replset.js";
import app from "../app.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import {
  createUser,
  signToken,
  createProduct,
  seedLoyaltySettings,
  seedSiteSettings,
} from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const shippingAddress = {
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
};

// A promise the test resolves by hand, to hold one request at a chosen
// point while the other one runs.
const barrier = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

// Delivered COD order of 3 (stock 5 -> 2) with a return of 1 requested but
// not yet picked up — the state where cancelling the order and moving the
// return on can race each other.
const deliveredWithOpenReturn = async () => {
  await seedSiteSettings({ codCharge: 0 });
  await seedLoyaltySettings({ earnRate: 20 });

  const user = await createUser();
  const admin = await createUser({ role: "admin" });
  const token = signToken(user);
  const adminToken = signToken(admin);
  const product = await createProduct({ price: 1000, stock: 5 });

  const placeRes = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      orderItems: [
        {
          product: product._id.toString(),
          name: product.name,
          image: product.image,
          price: product.price,
          quantity: 3,
        },
      ],
      shippingAddress,
      paymentMethod: "COD",
    });
  expect(placeRes.status).toBe(201);
  const order = placeRes.body.order;

  const delivered = await request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "Delivered" });
  expect(delivered.status).toBe(200);
  expect((await Product.findById(product._id)).stock).toBe(2);

  const returnRequest = await ReturnRequest.create({
    order: order._id,
    user: user._id,
    product: product._id,
    productName: product.name,
    quantity: 1,
    reason: "Didn't like it",
  });

  const before = {
    points: (await User.findById(user._id)).loyaltyPoints,
    ledgerEntries: await LoyaltyTransaction.countDocuments({ user: user._id }),
  };

  return { user, adminToken, product, order, returnRequest, before };
};

const cancelOrder = (adminToken, orderId) =>
  request(app)
    .put(`/api/orders/${orderId}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "Cancelled" });

const setReturnStatus = (adminToken, returnId, status) =>
  request(app)
    .put(`/api/returns/${returnId}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

// The cancellation won: every piece is back exactly once (5), and the
// return was left untouched, with nothing refunded or clawed back.
const expectCancelOnly = async ({ user, product, order, returnRequest, before }) => {
  expect((await Product.findById(product._id)).stock).toBe(5);
  expect((await User.findById(user._id)).loyaltyPoints).toBe(before.points);
  expect(await LoyaltyTransaction.countDocuments({ user: user._id })).toBe(before.ledgerEntries);

  const freshOrder = await Order.findById(order._id);
  expect(freshOrder.orderStatus).toBe("Cancelled");
  expect(freshOrder.refundedAmount || 0).toBe(0);

  const rr = await ReturnRequest.findById(returnRequest._id);
  expect(rr.status).toBe("Requested");
  expect(rr.stockRestored).toBe(false);
  expect(rr.pointsClawedBack).toBe(false);
};

// Holds the cancellation right after its stock write (inside its still-open
// transaction), and notes when a return reaches the point where it would
// collide with it: its own stock write, or its conditional write on the order.
const holdCancelAfterStockWrite = () => {
  const held = barrier();
  const cancelWroteStock = barrier();
  let armed = true;
  let returnWroteStock = false;

  const originalProductUpdate = Product.findByIdAndUpdate.bind(Product);
  vi.spyOn(Product, "findByIdAndUpdate").mockImplementation((...args) => {
    const session = args[2]?.session;

    if (session && armed) {
      armed = false;
      return (async () => {
        const result = await originalProductUpdate(...args);
        cancelWroteStock.release();
        await held.promise;
        return result;
      })();
    }

    if (!session) returnWroteStock = true;
    return originalProductUpdate(...args);
  });

  const orderUpdate = vi.spyOn(Order, "updateOne");
  const returnTriedOrder = () =>
    orderUpdate.mock.calls.some(([filter]) => filter?.orderStatus?.$ne === "Cancelled");

  return {
    cancelWroteStock: cancelWroteStock.promise,
    returnReachedCollision: () => returnWroteStock || returnTriedOrder(),
    releaseCancel: held.release,
  };
};

// Holds the return right after its first read of the order (the M1-A
// check), so a whole cancellation can commit before it carries on.
const holdReturnAfterOrderRead = () => {
  const held = barrier();
  const readDone = barrier();
  let armed = true;

  const originalFindById = Order.findById.bind(Order);
  vi.spyOn(Order, "findById").mockImplementation((...args) => {
    const query = originalFindById(...args);
    if (!armed) return query;

    armed = false;
    const exec = query.exec.bind(query);
    query.exec = async (...execArgs) => {
      const result = await exec(...execArgs);
      readDone.release();
      await held.promise;
      return result;
    };
    return query;
  });

  return { returnReadOrder: readDone.promise, releaseReturn: held.release };
};

describe("Return vs order cancellation running at the same time (R2)", () => {
  for (const status of ["Picked Up", "Refunded"]) {
    it(`window 2 (${status}): the return arrives while the cancellation's transaction holds the stock — 409, stock restocked once`, async () => {
      const setup = await deliveredWithOpenReturn();
      const hold = holdCancelAfterStockWrite();

      const cancelling = cancelOrder(setup.adminToken, setup.order._id).then((res) => res);
      await hold.cancelWroteStock;

      const returning = setReturnStatus(setup.adminToken, setup.returnRequest._id, status).then(
        (res) => res,
      );
      await vi.waitFor(() => expect(hold.returnReachedCollision()).toBe(true), {
        timeout: 15000,
        interval: 20,
      });
      hold.releaseCancel();

      const [cancelRes, returnRes] = await Promise.all([cancelling, returning]);

      expect(cancelRes.status).toBe(200);
      expect(returnRes.status).toBe(409);
      expect(returnRes.body.message).toMatch(/cancel/i);
      await expectCancelOnly(setup);
    });

    it(`window 1 (${status}): the whole cancellation commits between the return's order check and its writes — 409, stock restocked once`, async () => {
      const setup = await deliveredWithOpenReturn();
      const hold = holdReturnAfterOrderRead();

      const returning = setReturnStatus(setup.adminToken, setup.returnRequest._id, status).then(
        (res) => res,
      );
      await hold.returnReadOrder;

      const cancelRes = await cancelOrder(setup.adminToken, setup.order._id);
      expect(cancelRes.status).toBe(200);
      expect((await Product.findById(setup.product._id)).stock).toBe(5);

      hold.releaseReturn();
      const returnRes = await returning;

      expect(returnRes.status).toBe(409);
      expect(returnRes.body.message).toMatch(/cancel/i);
      await expectCancelOnly(setup);
    });
  }

  it("return picked up first, then the order cancelled: the returned piece is not restocked again", async () => {
    const setup = await deliveredWithOpenReturn();

    const picked = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Picked Up");
    expect(picked.status).toBe(200);
    expect((await Product.findById(setup.product._id)).stock).toBe(3);

    const cancelRes = await cancelOrder(setup.adminToken, setup.order._id);
    expect(cancelRes.status).toBe(200);

    expect((await Product.findById(setup.product._id)).stock).toBe(5);
    const rr = await ReturnRequest.findById(setup.returnRequest._id);
    expect(rr.status).toBe("Picked Up");
    expect(rr.stockRestored).toBe(true);
  });

  it("no cancellation: Picked Up -> Refunded restocks once and records the refund once", async () => {
    const setup = await deliveredWithOpenReturn();

    const picked = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Picked Up");
    expect(picked.status).toBe(200);
    const refunded = await setReturnStatus(setup.adminToken, setup.returnRequest._id, "Refunded");
    expect(refunded.status).toBe(200);

    expect((await Product.findById(setup.product._id)).stock).toBe(3);

    const freshOrder = await Order.findById(setup.order._id);
    expect(freshOrder.orderStatus).toBe("Delivered");
    expect(freshOrder.refundedAmount).toBe(1000);
    // 3 x 1000 earned 3000 / 20 = 150 pending; a third of the base came
    // back, so a third of the earn is taken back from the pending amount.
    expect(freshOrder.pointsEarned).toBe(150);
    expect(freshOrder.pointsClawedBack).toBe(50);
    expect((await User.findById(setup.user._id)).loyaltyPoints).toBe(setup.before.points);

    const rr = await ReturnRequest.findById(setup.returnRequest._id);
    expect(rr.status).toBe("Refunded");
    expect(rr.stockRestored).toBe(true);
    expect(rr.pointsClawedBack).toBe(true);
  });
});
