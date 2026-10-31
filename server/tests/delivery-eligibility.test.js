import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";

const { rzp, sendEmail } = vi.hoisted(() => ({
  rzp: { create: vi.fn(), fetch: vi.fn(), fetchPayments: vi.fn() },
  sendEmail: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class {
    constructor() {
      this.orders = { create: rzp.create, fetch: rzp.fetch, fetchPayments: rzp.fetchPayments };
    }
  },
}));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// Cancellation runs in a transaction, so this file needs the replica set.
import "./setup-replset.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import PincodeLookup from "../models/PincodeLookup.js";
import Address from "../models/Address.js";
import {
  checkDeliveryEligibility,
  getAllowedDeliveryStates,
} from "../utils/deliveryEligibility.js";
import { flagPaymentReview } from "../utils/orderPayment.js";
import { createUser, signToken, createProduct } from "./helpers.js";

// ---------- India Post stub ----------
// Per-PIN answers; "down" throws like a network failure. Any other fetch
// is a test bug and fails loudly.
let indiaPost;
let indiaPostCalls;

const office = (State, District = "Some District") => ({ Name: "Some PO", State, District });
const success = (...offices) => [{ Status: "Success", PostOffice: offices }];

const fakeFetch = async (url) => {
  const href = String(url);
  if (!href.startsWith("https://api.postalpincode.in/pincode/")) {
    throw new Error(`unexpected fetch in test: ${href}`);
  }
  const pin = href.split("/").pop();
  indiaPostCalls.push(pin);
  const answer = indiaPost[pin];
  if (answer === "down" || answer === undefined) throw new Error("network down");
  if (answer === "badjson") return { ok: true, json: async () => { throw new SyntaxError("bad json"); } };
  return { ok: true, json: async () => answer };
};

const DELHI = "110001";
const KERALA = "691306";
const NOIDA = "201301";

beforeAll(() => {
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin-alerts@example.com";
  process.env.CLIENT_URL = "https://www.mittalcollections.com";
  process.env.RAZORPAY_KEY_ID = "test-key-id";
});

beforeEach(() => {
  indiaPost = {
    [DELHI]: success(office("Delhi", "Central Delhi")),
    [KERALA]: success(office("Kerala", "Kollam")),
    [NOIDA]: success(office("Uttar Pradesh", "Gautam Buddha Nagar")),
  };
  indiaPostCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  sendEmail.mockReset().mockResolvedValue(undefined);
  Object.values(rzp).forEach((fn) => fn.mockReset());
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

const cachePin = (pincode, state) =>
  PincodeLookup.create({ pincode, state, district: "x", verifiedAt: new Date() });

const address = (pincode, state = "Uttar Pradesh") => ({
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Somewhere",
  state,
  pincode,
});

let counter = 0;
const makeOrder = async (pincode, overrides = {}) => {
  counter += 1;
  const user = await createUser();
  const product = await createProduct({ stock: 5 });
  const order = await Order.create({
    user: user._id,
    orderItems: [{ product: product._id, name: product.name, image: product.image, price: 999, quantity: 1 }],
    shippingAddress: address(pincode),
    paymentMethod: "Razorpay",
    razorpayOrderId: `order_dg${counter}`,
    totalPrice: 999,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });
  return { order, user, product };
};

const placeOrder = (token, body) => request(app).post("/api/orders").set("Authorization", `Bearer ${token}`).send(body);

const orderBody = (product, pincode, extra = {}) => ({
  orderItems: [{ product: product._id.toString(), name: product.name, image: product.image, price: product.price, quantity: 1 }],
  shippingAddress: address(pincode),
  paymentMethod: "COD",
  ...extra,
});

let adminToken;
beforeEach(async () => {
  adminToken = signToken(await createUser({ role: "admin" }));
});

const setStatus = (order, status, body = {}) =>
  request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status, ...body });

const SECRET = "test-webhook-secret";
const webhook = (razorpayOrderId, { paymentId = "pay_dg", amount = 99900, eventId = "evt_dg1" } = {}) => {
  const raw = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: "INR", status: "captured" } } },
  });
  return request(app)
    .post("/api/payments/razorpay/webhook")
    .set("Content-Type", "application/json")
    .set("X-Razorpay-Event-Id", eventId)
    .set("X-Razorpay-Signature", crypto.createHmac("sha256", SECRET).update(raw).digest("hex"))
    .send(raw);
};

const adminAlerts = () => sendEmail.mock.calls.filter(([arg]) => arg.to === "admin-alerts@example.com");

// ======================================================================

describe("checkDeliveryEligibility — lookup and cache", () => {
  it("1. a cached UP PIN is eligible without calling India Post", async () => {
    const result = await checkDeliveryEligibility("201012");
    expect(result).toMatchObject({ eligible: true, state: "Uttar Pradesh", source: "cache" });
    expect(indiaPostCalls).toEqual([]);
  });

  it("2. a new UP PIN is verified with India Post and cached", async () => {
    const result = await checkDeliveryEligibility(NOIDA);
    expect(result).toMatchObject({ eligible: true, state: "Uttar Pradesh", source: "india_post" });
    expect(await PincodeLookup.findOne({ pincode: NOIDA })).toMatchObject({ state: "Uttar Pradesh" });
  });

  it("3. an out-of-UP PIN is not serviceable", async () => {
    const result = await checkDeliveryEligibility(DELHI);
    expect(result).toMatchObject({ eligible: false, reason: "not_serviceable", state: "Delhi" });
  });

  it("4. a PIN whose post offices span two states is ambiguous and never cached", async () => {
    indiaPost["244712"] = success(office("Uttar Pradesh"), office("Uttarakhand"));
    const result = await checkDeliveryEligibility("244712");
    expect(result).toMatchObject({ eligible: false, reason: "ambiguous" });
    expect(await PincodeLookup.countDocuments({ pincode: "244712" })).toBe(0);
  });

  it("5. failures are 'unverified' and never cached: network down, bad JSON, empty, missing state, odd status", async () => {
    indiaPost["201002"] = "down";
    indiaPost["201003"] = "badjson";
    indiaPost["201004"] = success();
    indiaPost["201005"] = success({ Name: "PO", District: "Ghaziabad" });
    indiaPost["201006"] = [{ Status: "Pending" }];
    indiaPost["201007"] = { not: "an array" };

    for (const pin of ["201002", "201003", "201004", "201005", "201006", "201007"]) {
      const result = await checkDeliveryEligibility(pin);
      expect(result, pin).toMatchObject({ eligible: false, reason: "unverified" });
    }
    expect(await PincodeLookup.countDocuments({ pincode: /^20100[2-7]$/ })).toBe(0);
  });

  it("6. India Post's 'no such PIN' answer is invalid and not cached", async () => {
    indiaPost["999999"] = [{ Status: "Error", PostOffice: null }];
    const result = await checkDeliveryEligibility("999999");
    expect(result).toMatchObject({ eligible: false, reason: "invalid" });
    expect(await PincodeLookup.countDocuments({ pincode: "999999" })).toBe(0);
  });

  it("7. malformed input is invalid without any lookup", async () => {
    for (const bad of ["12345", "abcdef", "1234567", "", null, undefined, { $gt: "" }, ["201001"]]) {
      expect((await checkDeliveryEligibility(bad)).reason).toBe("invalid");
    }
    expect(indiaPostCalls).toEqual([]);
  });

  it("8. cacheOnly never calls India Post: a missing PIN is unverified", async () => {
    const result = await checkDeliveryEligibility(NOIDA, { cacheOnly: true });
    expect(result).toMatchObject({ eligible: false, reason: "unverified" });
    expect(indiaPostCalls).toEqual([]);
  });

  it("9. India Post down: a cached UP PIN still works, an uncached one fails closed", async () => {
    indiaPost[NOIDA] = "down";
    expect((await checkDeliveryEligibility(NOIDA)).reason).toBe("unverified");
    await cachePin(NOIDA, "Uttar Pradesh");
    expect((await checkDeliveryEligibility(NOIDA)).eligible).toBe(true);
  });

  it("10. an empty or malformed allowed-states config allows no state (never all-India)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getAllowedDeliveryStates([])).toEqual([]);
    expect(getAllowedDeliveryStates(null)).toEqual([]);
    expect(getAllowedDeliveryStates("Uttar Pradesh")).toEqual([]);
    expect(getAllowedDeliveryStates(["", "  "])).toEqual([]);
    expect(getAllowedDeliveryStates()).toEqual(["uttar pradesh"]);
  });
});

describe("POST /api/orders — UP-only gate", () => {
  it("11. a UP PIN places a COD order normally", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 999, stock: 3 });
    const res = await placeOrder(signToken(user), orderBody(product, "201012"));
    expect(res.status).toBe(201);
    expect((await Product.findById(product._id)).stock).toBe(2);
  });

  it("12. a UP PIN places a Razorpay order normally", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 999, stock: 3 });
    rzp.create.mockResolvedValue({ id: "order_up1", amount: 99900, currency: "INR" });
    const res = await placeOrder(signToken(user), orderBody(product, "201012", { paymentMethod: "Razorpay" }));
    expect(res.status).toBe(201);
    expect(rzp.create).toHaveBeenCalledTimes(1);
    expect(res.body.razorpayOrder.id).toBe("order_up1");
  });

  it("13. an out-of-UP PIN is refused with no order, no Razorpay order and no stock change", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 999, stock: 3 });

    for (const [pin, method] of [[KERALA, "Razorpay"], [DELHI, "COD"]]) {
      const res = await placeOrder(signToken(user), orderBody(product, pin, { paymentMethod: method }));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "DELIVERY_UNAVAILABLE", reason: "not_serviceable" });
      expect(res.body.messageHi).toBeTruthy();
    }

    expect(await Order.countDocuments()).toBe(0);
    expect(rzp.create).not.toHaveBeenCalled();
    expect((await Product.findById(product._id)).stock).toBe(3);
  });

  it("14. address typed as Uttar Pradesh but PIN is Delhi: refused (the PIN decides)", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 999, stock: 3 });
    const res = await placeOrder(signToken(user), orderBody(product, DELHI));
    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("15. invalid or unverifiable PINs are refused", async () => {
    const user = await createUser();
    const product = await createProduct({ price: 999, stock: 3 });
    indiaPost["201099"] = "down";

    const invalid = await placeOrder(signToken(user), orderBody(product, "12345"));
    expect(invalid.body).toMatchObject({ code: "DELIVERY_UNAVAILABLE", reason: "invalid" });

    const unverified = await placeOrder(signToken(user), orderBody(product, "201099"));
    expect(unverified.body).toMatchObject({ code: "DELIVERY_UNAVAILABLE", reason: "unverified" });
    expect(await Order.countDocuments()).toBe(0);
  });

  it("16. an idempotent retry never hands back an unpaid order whose PIN isn't eligible", async () => {
    await cachePin(DELHI, "Delhi");
    const { order, user } = await makeOrder(DELHI, { clientRequestId: "req-old-delhi" });
    const product = await createProduct({ price: 999, stock: 3 });

    const res = await placeOrder(signToken(user), orderBody(product, DELHI, { clientRequestId: "req-old-delhi" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DELIVERY_UNAVAILABLE");
    expect(res.body.razorpayOrder).toBeUndefined();
    expect((await Order.findById(order._id)).isPaid).toBe(false);

    // An eligible earlier order is still returned as before.
    const ok = await makeOrder("201001", { clientRequestId: "req-old-up" });
    const again = await placeOrder(signToken(ok.user), orderBody(product, "201001", { clientRequestId: "req-old-up" }));
    expect(again.status).toBe(200);
    expect(again.body.order._id).toBe(String(ok.order._id));
  });

  it("16a. retry of a CANCELLED unpaid out-of-UP order returns no payment reference and doesn't reopen it", async () => {
    await cachePin(DELHI, "Delhi");
    const { order, user } = await makeOrder(DELHI, { orderStatus: "Cancelled", clientRequestId: "req-cx-delhi" });
    const product = await createProduct({ price: 999, stock: 3 });

    const res = await placeOrder(signToken(user), orderBody(product, DELHI, { clientRequestId: "req-cx-delhi" }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORDER_CANCELLED");
    expect(res.body.razorpayOrder).toBeUndefined();
    expect(res.body.razorpayKeyId).toBeUndefined();
    expect(res.body.order).toBeUndefined();

    const after = await Order.findById(order._id);
    expect(after.orderStatus).toBe("Cancelled");
    expect(after.isPaid).toBe(false);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("16b. retry of a CANCELLED unpaid order with an unverifiable PIN returns no payment reference", async () => {
    indiaPost["201097"] = "down";
    const { user } = await makeOrder("201097", { orderStatus: "Cancelled", clientRequestId: "req-cx-unv" });
    const product = await createProduct({ price: 999, stock: 3 });

    const res = await placeOrder(signToken(user), orderBody(product, "201097", { clientRequestId: "req-cx-unv" }));
    expect(res.status).toBe(409);
    expect(res.body.razorpayOrder).toBeUndefined();
    expect(res.body.order).toBeUndefined();
    expect(indiaPostCalls).toEqual([]);
  });

  it("16c. retry of a live unpaid UP order still returns the same order with its payment reference", async () => {
    const { order, user } = await makeOrder("201001", { clientRequestId: "req-live-up" });
    const product = await createProduct({ price: 999, stock: 3 });

    const res = await placeOrder(signToken(user), orderBody(product, "201001", { clientRequestId: "req-live-up" }));
    expect(res.status).toBe(200);
    expect(res.body.order._id).toBe(String(order._id));
    expect(res.body.razorpayOrder.id).toBe(order.razorpayOrderId);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("16d. retry of an already-paid order (even out-of-UP or cancelled) is returned unchanged", async () => {
    await cachePin(DELHI, "Delhi");
    const product = await createProduct({ price: 999, stock: 3 });

    for (const [i, overrides] of [
      [1, { isPaid: true, razorpayPaymentId: "pay_done1" }],
      [2, { isPaid: true, razorpayPaymentId: "pay_done2", orderStatus: "Cancelled" }],
    ]) {
      const { order, user } = await makeOrder(DELHI, { clientRequestId: `req-paid-${i}`, ...overrides });
      const res = await placeOrder(signToken(user), orderBody(product, DELHI, { clientRequestId: `req-paid-${i}` }));
      expect(res.status).toBe(200);
      expect(res.body.order._id).toBe(String(order._id));

      const after = await Order.findById(order._id);
      expect(after.isPaid).toBe(true);
      expect(after.razorpayPaymentId).toBe(overrides.razorpayPaymentId);
      expect(after.orderStatus).toBe(overrides.orderStatus || "Pending");
    }
  });
});

describe("resume-payment and convert-to-COD", () => {
  it("17. resume-payment does not reopen payment for an out-of-UP unpaid order", async () => {
    await cachePin(DELHI, "Delhi");
    const { order, user } = await makeOrder(DELHI, { razorpayOrderId: "order_resume_dl" });
    rzp.fetch.mockResolvedValue({ id: "order_resume_dl", status: "created", amount: 99900, currency: "INR" });
    rzp.fetchPayments.mockResolvedValue({ items: [] });

    const res = await request(app)
      .post(`/api/orders/${order._id}/resume-payment`)
      .set("Authorization", `Bearer ${signToken(user)}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DELIVERY_UNAVAILABLE");
    expect(res.body.razorpayOrder).toBeUndefined();
  });

  it("18. admin convert-to-COD is refused for an out-of-UP order (before asking Razorpay)", async () => {
    await cachePin(KERALA, "Kerala");
    const { order } = await makeOrder(KERALA, { orderStatus: "Cancelled" });

    const res = await request(app)
      .put(`/api/orders/${order._id}/convert-to-cod`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DELIVERY_RESTRICTED");
    expect(rzp.fetch).not.toHaveBeenCalled();
    expect((await Order.findById(order._id)).paymentMethod).toBe("Razorpay");
  });
});

describe("updateOrderStatus — dispatch lock", () => {
  it("19. Pending → Shipped and Pending → Delivered are refused for an out-of-UP PIN", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI, { paymentMethod: "COD", razorpayOrderId: undefined });

    for (const status of ["Processing", "Shipped", "Delivered"]) {
      const res = await setStatus(order, status);
      if (status === "Processing") {
        expect(res.status).toBe(200);
      } else {
        expect(res.status, status).toBe(400);
        expect(res.body.code).toBe("DELIVERY_RESTRICTED");
      }
    }
    expect((await Order.findById(order._id)).orderStatus).toBe("Processing");
  });

  it("20. an unverifiable PIN can't be dispatched either", async () => {
    indiaPost["201098"] = "down";
    const { order } = await makeOrder("201098", { paymentMethod: "COD", razorpayOrderId: undefined });
    const res = await setStatus(order, "Shipped");
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("unverified");
  });

  it("21. an already-Shipped out-of-UP order may be marked Delivered; its delivery review stays open", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI, {
      paymentMethod: "COD",
      razorpayOrderId: undefined,
      orderStatus: "Shipped",
      paymentReviewNeeded: true,
      paymentReviewReason: "delivery_restricted",
    });

    const res = await setStatus(order, "Delivered");
    expect(res.status).toBe(200);
    const after = await Order.findById(order._id);
    expect(after.orderStatus).toBe("Delivered");
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("delivery_restricted");
  });

  it("22. a UP order ships normally, and an out-of-UP order can still be cancelled", async () => {
    const up = await makeOrder("201001", { paymentMethod: "COD", razorpayOrderId: undefined });
    expect((await setStatus(up.order, "Shipped")).status).toBe(200);

    await cachePin(DELHI, "Delhi");
    const out = await makeOrder(DELHI, { paymentMethod: "COD", razorpayOrderId: undefined });
    const res = await setStatus(out.order, "Cancelled");
    expect(res.status).toBe(200);
    expect((await Order.findById(out.order._id)).orderStatus).toBe("Cancelled");
  });
});

describe("payments on a restricted order (webhook / markOrderPaid)", () => {
  it("23. a captured payment is recorded, a delivery_restricted review opens once, and dispatch stays blocked", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI);

    const res = await webhook(order.razorpayOrderId);
    expect(res.status).toBe(200);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.razorpayPaymentId).toBe("pay_dg");
    expect(after.orderStatus).toBe("Pending");
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("delivery_restricted");
    await vi.waitFor(() => expect(adminAlerts()).toHaveLength(1));

    // Duplicate delivery: no second write, no second alert.
    const dup = await webhook(order.razorpayOrderId, { eventId: "evt_dg2" });
    expect(dup.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(adminAlerts()).toHaveLength(1);

    expect((await setStatus(order, "Shipped")).status).toBe(400);
  });

  it("24. the payment path is cache-only: an uncached PIN is unverified (restricted) and India Post isn't called", async () => {
    const { order } = await makeOrder(NOIDA);
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewReason).toBe("delivery_restricted");
    expect(indiaPostCalls).toEqual([]);
  });

  it("25. a late payment keeps its own reason and adds delivery_restricted alongside", async () => {
    await cachePin(KERALA, "Kerala");
    const { order } = await makeOrder(KERALA, { orderStatus: "Cancelled" });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewReason).toBe("paid_after_cancellation");
    expect(after.paymentReviewOtherReasons).toEqual(["delivery_restricted"]);
  });

  it("26. a normal UP payment opens no review (unchanged behaviour)", async () => {
    const { order } = await makeOrder("201001");
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewNeeded).not.toBe(true);
    expect(adminAlerts()).toHaveLength(0);
  });

  it("27. a payment does not auto-settle an open review that still carries another reason", async () => {
    const { order } = await makeOrder("201001", {
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
      paymentReviewOtherReasons: ["delivery_restricted"],
    });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewResolvedBy).not.toBe("system");
  });

  it("28. a new reason on an already-open review is kept, not dropped", async () => {
    const { order } = await makeOrder(DELHI, {
      isPaid: true,
      paymentReviewNeeded: true,
      paymentReviewReason: "delivery_restricted",
    });

    expect(await flagPaymentReview(order._id, "duplicate_payment")).toBe(false);
    const after = await Order.findById(order._id);
    expect(after.paymentReviewReason).toBe("delivery_restricted");
    expect(after.paymentReviewOtherReasons).toEqual(["duplicate_payment"]);
  });

  it("29. cancelling a paid restricted order records refund-due alongside the delivery reason", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI, {
      isPaid: true,
      paymentReviewNeeded: true,
      paymentReviewReason: "delivery_restricted",
    });

    const res = await setStatus(order, "Cancelled", { confirmPaidCancellation: true });
    expect(res.status).toBe(200);
    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewReason).toBe("delivery_restricted");
    expect(after.paymentReviewOtherReasons).toEqual(["paid_order_cancelled"]);
  });
});

describe("payment review reasons are merged, never lost", () => {
  const reasonsOf = (order) => [...(order.paymentReviewOtherReasons || [])].sort();

  it("33. open review (authorized_uncaptured + duplicate_payment) + late payment + delivery restriction: every reason kept", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI, {
      orderStatus: "Cancelled",
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
      paymentReviewOtherReasons: ["duplicate_payment"],
    });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("paid_after_cancellation");
    expect(reasonsOf(after)).toEqual(["authorized_uncaptured", "delivery_restricted", "duplicate_payment"]);
  });

  it("34. open review with secondary reasons + delivery restriction only: primary and old reasons stay, restriction added", async () => {
    await cachePin(KERALA, "Kerala");
    const { order } = await makeOrder(KERALA, {
      paymentReviewNeeded: true,
      paymentReviewReason: "check_inconclusive",
      paymentReviewOtherReasons: ["amount_mismatch"],
    });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewReason).toBe("check_inconclusive");
    expect(reasonsOf(after)).toEqual(["amount_mismatch", "delivery_restricted"]);
    expect(after.paymentReviewResolvedBy).not.toBe("system");
  });

  it("35. repeated webhook / verify processing adds no duplicate reasons and changes nothing", async () => {
    await cachePin(DELHI, "Delhi");
    const { order } = await makeOrder(DELHI, {
      orderStatus: "Cancelled",
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
      paymentReviewOtherReasons: ["delivery_restricted"],
    });

    await webhook(order.razorpayOrderId, { eventId: "evt_r1" });
    const first = await Order.findById(order._id);
    await webhook(order.razorpayOrderId, { eventId: "evt_r2" });
    await webhook(order.razorpayOrderId, { eventId: "evt_r3" });
    const after = await Order.findById(order._id);

    expect(after.paymentReviewReason).toBe("paid_after_cancellation");
    expect(reasonsOf(after)).toEqual(["authorized_uncaptured", "delivery_restricted"]);
    expect(reasonsOf(after)).toEqual(reasonsOf(first));
    expect(after.paymentReviewFlaggedAt.getTime()).toBe(first.paymentReviewFlaggedAt.getTime());
  });

  it("36. a normal UP payment still settles an open authorized/inconclusive review with no other reason", async () => {
    const { order } = await makeOrder("201001", {
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
    });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewNeeded).toBe(false);
    expect(after.paymentReviewResolvedBy).toBe("system");
    expect(after.paymentReviewReason).toBe("authorized_uncaptured");
    expect(after.paymentReviewOtherReasons ?? []).toHaveLength(0);
    expect(adminAlerts()).toHaveLength(0);
  });

  it("37. an open review with an unresolved secondary reason does not auto-close on a normal UP payment", async () => {
    const { order } = await makeOrder("201001", {
      paymentReviewNeeded: true,
      paymentReviewReason: "authorized_uncaptured",
      paymentReviewOtherReasons: ["duplicate_payment"],
    });
    await webhook(order.razorpayOrderId);

    const after = await Order.findById(order._id);
    expect(after.isPaid).toBe(true);
    expect(after.paymentReviewNeeded).toBe(true);
    expect(after.paymentReviewResolvedBy).not.toBe("system");
    expect(after.paymentReviewReason).toBe("authorized_uncaptured");
    expect(reasonsOf(after)).toEqual(["duplicate_payment"]);
  });
});

describe("admin list, PIN checker, saved addresses", () => {
  it("30. GET /api/orders marks each order's delivery check from the cache only", async () => {
    await cachePin(DELHI, "Delhi");
    const up = await makeOrder("201001");
    const out = await makeOrder(DELHI);
    const unknown = await makeOrder(NOIDA);

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.orders.map((o) => [o._id, o.deliveryCheck]));

    expect(byId[String(up.order._id)]).toMatchObject({ eligible: true });
    expect(byId[String(out.order._id)]).toMatchObject({ eligible: false, reason: "not_serviceable", state: "Delhi" });
    expect(byId[String(unknown.order._id)]).toMatchObject({ eligible: false, reason: "unverified" });
    expect(indiaPostCalls).toEqual([]);
  });

  it("31. the public PIN checker reports deliverable with the customer message", async () => {
    const out = await request(app).get(`/api/delivery/check-pincode/${DELHI}`);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ deliverable: false, reason: "not_serviceable", fastDelivery: false });
    expect(out.body.message).toMatch(/Uttar Pradesh/);
    expect(out.body.messageHi).toBeTruthy();

    indiaPost["201001"] = success({ Name: "Ghaziabad H.O", State: "Uttar Pradesh", District: "Ghaziabad" });
    const ok = await request(app).get("/api/delivery/check-pincode/201001");
    expect(ok.body).toMatchObject({ deliverable: true, state: "Uttar Pradesh", found: true });
  });

  it("32. editing a saved address never changes an existing order's shipping address", async () => {
    const { order, user } = await makeOrder("201001");
    const saved = await Address.create({ user: user._id, ...address("201001"), country: "India" });

    await request(app)
      .put(`/api/addresses/${saved._id}`)
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ ...address(DELHI, "Delhi"), country: "India" });

    expect((await Order.findById(order._id)).shippingAddress.pincode).toBe("201001");
  });
});
