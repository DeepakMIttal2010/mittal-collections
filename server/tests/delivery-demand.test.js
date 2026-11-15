import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// The rate-limit escape hatch is read at module load; set before app.js.
vi.hoisted(() => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
});

import "./setup.js";
import app from "../app.js";
import DeliveryDemand from "../models/DeliveryDemand.js";
import DeliveryDemandIpDay from "../models/DeliveryDemandIpDay.js";
import PincodeLookup from "../models/PincodeLookup.js";
import Role from "../models/Role.js";
import {
  buildDemandReport,
  csvCell,
  parseReportFilters,
  priceDemandItems,
  regionOf,
} from "../controllers/deliveryDemandController.js";
import { hashClientIp, hashVisitorId } from "../utils/deliveryDemandKey.js";
import { istTodayString, istDaysAgoString } from "../utils/istDate.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const REAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const DELHI = "110001";
const GURGAON = "122001";
const UP = "201001"; // seeded as Uttar Pradesh by seedPincodes.js
const UNCACHED = "999999";
const VISITOR = "guest-browser-0001";

const beacon = (body, token) => {
  const req = request(app).post("/api/delivery/demand").set("User-Agent", REAL_UA);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return req.send(body);
};

beforeEach(async () => {
  await PincodeLookup.insertMany([
    { pincode: DELHI, state: "Delhi", district: "Central Delhi", verifiedAt: new Date() },
    { pincode: GURGAON, state: "Haryana", district: "Gurgaon", verifiedAt: new Date() },
  ]);
  // Recording is cache-only; any network call here is a bug.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/delivery/demand — recording", () => {
  it("records a guest product-page check once per day, counting repeat attempts", async () => {
    const product = await createProduct({ name: "Tulip Comforter" });

    const first = await beacon({ pincode: DELHI, source: "product", productId: String(product._id), visitorId: VISITOR });
    await beacon({ pincode: DELHI, source: "product", productId: String(product._id), visitorId: VISITOR });

    expect(first.status).toBe(202);
    const rows = await DeliveryDemand.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      visitorKey: `v:${hashVisitorId(VISITOR)}`,
      user: null,
      pincode: DELHI,
      state: "Delhi",
      district: "Central Delhi",
      reason: "not_serviceable",
      source: "product",
      productName: "Tulip Comforter",
      attempts: 2,
      day: istTodayString(),
    });
    expect(String(rows[0].category)).toBe(String(product.category));
    // The raw visitorId is never stored.
    expect(JSON.stringify(rows[0])).not.toContain(VISITOR);
  });

  it("records nothing for a deliverable UP PIN, an invalid PIN, or a bot", async () => {
    await beacon({ pincode: UP, source: "header", visitorId: VISITOR });
    await request(app)
      .post("/api/delivery/demand")
      .set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)")
      .send({ pincode: DELHI, source: "header", visitorId: VISITOR });

    expect(await DeliveryDemand.countDocuments()).toBe(0);
  });

  it("keeps an unverifiable PIN (India Post down) as 'unverified' with no state, without any network call", async () => {
    await beacon({ pincode: UNCACHED, source: "header", visitorId: VISITOR });

    const row = await DeliveryDemand.findOne().lean();
    expect(row).toMatchObject({ reason: "unverified", state: "", source: "header" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed input with 400", async () => {
    expect((await beacon({ pincode: "11000", source: "header", visitorId: VISITOR })).status).toBe(400);
    expect((await beacon({ pincode: DELHI, source: "order", visitorId: VISITOR })).status).toBe(400);
    expect((await beacon({ pincode: DELHI, source: "product", productId: { $ne: null }, visitorId: VISITOR })).status).toBe(400);
    expect((await beacon({ pincode: DELHI, source: "header", visitorId: { $gt: "" } })).status).toBe(400);
    expect(await DeliveryDemand.countDocuments()).toBe(0);
  });

  it("ignores checkout checks from guests and any check from an admin/staff account", async () => {
    const admin = await createUser({ role: "admin" });

    await beacon({ pincode: DELHI, source: "checkout", visitorId: VISITOR, items: [] });
    await beacon({ pincode: DELHI, source: "header", visitorId: VISITOR }, signToken(admin));

    expect(await DeliveryDemand.countDocuments()).toBe(0);
  });

  it("prices a logged-in checkout cart from the database, merging duplicate lines and skipping bad ones", async () => {
    const customer = await createUser();
    const plain = await createProduct({ name: "Bath Towel", price: 300, purchasePrice: 180, miscExpenses: 20 });
    const sized = await createProduct({
      name: "Curtain",
      price: 700,
      variants: [
        { size: "7x4", price: 700, stock: 5, purchasePrice: 400 },
        { size: "9x4", price: 900, stock: 5, purchasePrice: 0 },
      ],
    });

    await beacon(
      {
        pincode: GURGAON,
        source: "checkout",
        items: [
          { product: String(plain._id), quantity: 1, price: 1 }, // client price ignored
          { product: String(plain._id), quantity: 2 },
          { product: String(sized._id), size: "9x4", quantity: 1 },
          { product: String(sized._id), quantity: 1 }, // sized product without size: skipped
          { product: String(sized._id), size: "12x4", quantity: 1 }, // unknown size: skipped
          { product: "not-an-id", quantity: 1 },
          { product: String(plain._id), quantity: -3 },
        ],
      },
      signToken(customer),
    );

    const row = await DeliveryDemand.findOne().lean();
    expect(row).toMatchObject({
      visitorKey: `u:${customer._id}`,
      state: "Haryana",
      district: "Gurgaon",
      source: "checkout",
      cartValue: 3 * 300 + 900,
      cartCost: 3 * 200, // 9x4 has no purchase price recorded
      costIncomplete: true,
    });
    expect(String(row.user)).toBe(String(customer._id));
    expect(row.items.map((item) => [item.name, item.size, item.quantity, item.unitPrice])).toEqual([
      ["Bath Towel", "", 3, 300],
      ["Curtain", "9x4", 1, 900],
    ]);
  });

  it("keeps the latest cart for a repeated checkout check on the same day", async () => {
    const customer = await createUser();
    const product = await createProduct({ price: 500, purchasePrice: 300 });
    const token = signToken(customer);

    await beacon({ pincode: DELHI, source: "checkout", items: [{ product: String(product._id), quantity: 1 }] }, token);
    await beacon({ pincode: DELHI, source: "checkout", items: [{ product: String(product._id), quantity: 4 }] }, token);

    const rows = await DeliveryDemand.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempts: 2, cartValue: 2000, cartCost: 1200, costIncomplete: false });
  });

  it("does not change the public check-pincode response", async () => {
    const res = await request(app).get(`/api/delivery/check-pincode/${DELHI}`);
    expect(res.body).toMatchObject({ success: true, deliverable: false, state: "Delhi", reason: "not_serviceable" });
    expect(await DeliveryDemand.countDocuments()).toBe(0);
  });
});

describe("priceDemandItems", () => {
  it("returns an empty cart for non-array input", async () => {
    expect(await priceDemandItems("x")).toEqual({ items: [], cartValue: 0, cartCost: 0, costIncomplete: false, outlier: false, outlierReasons: [] });
  });
});

describe("report helpers", () => {
  it("classifies regions and clamps filters to 365 days", () => {
    expect(regionOf("Uttar Pradesh")).toBe("up");
    expect(regionOf(" uttar pradesh ")).toBe("up");
    expect(regionOf("Delhi")).toBe("outside_up");
    expect(regionOf("")).toBe("unknown");

    const filters = parseReportFilters({ from: "2000-01-01", to: "2999-01-01", region: "bogus", source: "x" });
    expect(filters).toMatchObject({ from: istDaysAgoString(364), to: istTodayString(), region: "outside_up", source: "all", state: "", pincode: "", product: "" });
    expect(parseReportFilters({ pincode: "12", product: { $ne: 1 }, state: "x".repeat(200) })).toMatchObject({ pincode: "", product: "", state: "x".repeat(80) });
    expect(parseReportFilters({}).from).toBe(istDaysAgoString(29));
  });

  it("guards CSV cells against formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe("");
  });

  it("counts a customer's cart once (latest) across days and keeps unverified checks separate", () => {
    const u1 = "u1";
    const docs = [
      { visitorKey: "u:u1", user: u1, source: "checkout", pincode: DELHI, state: "Delhi", district: "Central Delhi", reason: "not_serviceable", attempts: 2, lastAt: "2026-11-10T10:00:00Z", cartValue: 1000, cartCost: 600, items: [{ product: "p1", name: "Towel", quantity: 2, unitPrice: 500, unitCost: 300 }] },
      { visitorKey: "u:u1", user: u1, source: "checkout", pincode: DELHI, state: "Delhi", district: "Central Delhi", reason: "not_serviceable", attempts: 1, lastAt: "2026-11-12T10:00:00Z", cartValue: 1500, cartCost: 900, items: [{ product: "p1", name: "Towel", quantity: 3, unitPrice: 500, unitCost: 300 }] },
      { visitorKey: "v:g1", user: null, source: "product", product: "p1", productName: "Towel", pincode: GURGAON, state: "Haryana", district: "Gurgaon", reason: "not_serviceable", attempts: 4, lastAt: "2026-11-11T10:00:00Z" },
      { visitorKey: "v:g2", user: null, source: "header", pincode: UNCACHED, state: "", district: "", reason: "unverified", attempts: 5, lastAt: "2026-11-11T10:00:00Z" },
      { visitorKey: "v:g3", user: null, source: "header", pincode: UP, state: "Uttar Pradesh", district: "Ghaziabad", reason: "ambiguous", attempts: 1, lastAt: "2026-11-11T10:00:00Z" },
    ];
    const users = new Map([[u1, { name: "Asha", mobile: "9000000001" }]]);

    const report = buildDemandReport(docs, { region: "outside_up", users });

    expect(report.totals).toEqual({
      checks: 7,
      checkoutAttempts: 3,
      uniqueVisitors: 2,
      loggedInCustomers: 1,
      checkoutCustomers: 1,
      potentialValue: 1500,
      estimatedMargin: 600,
      costIncomplete: false,
      incompleteCarts: 0,
      completeCartsValue: 1500,
      completeCartsMargin: 600,
      outlierCarts: 0,
      outlierValue: 0,
      reasonChecks: { not_serviceable: 7, unverified: 5, ambiguous: 1 },
    });
    expect(report.byState.map((row) => [row.state, row.uniqueVisitors, row.checkoutCustomers, row.checkoutAttempts, row.potentialValue])).toEqual([
      ["Delhi", 1, 1, 3, 1500],
      ["Haryana", 1, 0, 0, 0],
    ]);
    expect(report.byProduct).toHaveLength(1);
    expect(report.byProduct[0]).toMatchObject({ product: "Towel", uniqueVisitors: 2, checks: 4, checkoutCustomers: 1, quantity: 3, potentialValue: 1500, estimatedMargin: 600 });
    expect(report.checkoutCustomers).toEqual([
      expect.objectContaining({ name: "Asha", mobile: "9000000001", pincode: DELHI, cartValue: 1500, attempts: 3 }),
    ]);

    expect(buildDemandReport(docs, { region: "all" }).totals.uniqueVisitors).toBe(4);
    expect(buildDemandReport(docs, { region: "up" }).byState.map((row) => row.state)).toEqual(["Uttar Pradesh"]);
    expect(buildDemandReport(docs, { region: "unknown" }).byState.map((row) => row.state)).toEqual(["Unverified"]);
  });
});

describe("GET /api/delivery/demand/report and /export (admin)", () => {
  const seedDemand = async () => {
    const customer = await createUser({ name: "Ravi Kumar", mobile: "9876543210" });
    const product = await createProduct({ name: "Glace Bedsheet", price: 800, purchasePrice: 500 });
    await beacon({ pincode: DELHI, source: "product", productId: String(product._id), visitorId: VISITOR });
    await beacon({ pincode: GURGAON, source: "checkout", items: [{ product: String(product._id), quantity: 1 }] }, signToken(customer));
    // A logged-in customer's product-page check: counted, but no identity shown.
    const browser = await createUser({ name: "Only Browsing", mobile: "9111111111" });
    await beacon({ pincode: DELHI, source: "header" }, signToken(browser));
    return { customer, browser };
  };

  it("is admin-only and honours the delivery-demand permission for staff roles", async () => {
    const customer = await createUser();
    const res = await request(app).get("/api/delivery/demand/report").set("Authorization", `Bearer ${signToken(customer)}`);
    expect(res.status).toBe(403);

    const role = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });
    const denied = await request(app).get("/api/delivery/demand/report").set("Authorization", `Bearer ${signToken(staff)}`);
    expect(denied.status).toBe(403);

    await Role.updateOne({ _id: role._id }, { $set: { permissions: ["delivery-demand"] } });
    const allowed = await request(app).get("/api/delivery/demand/report").set("Authorization", `Bearer ${signToken(staff)}`);
    expect(allowed.status).toBe(200);
  });

  it("returns totals and tables, with identity only for checkout customers", async () => {
    await seedDemand();
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .get("/api/delivery/demand/report?region=outside_up")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ checks: 3, checkoutAttempts: 1, uniqueVisitors: 3, loggedInCustomers: 2, checkoutCustomers: 1, potentialValue: 800, estimatedMargin: 300 });
    expect(res.body.byState.map((row) => row.state).sort()).toEqual(["Delhi", "Haryana"]);
    expect(res.body.byProduct[0]).toMatchObject({ product: "Glace Bedsheet", uniqueVisitors: 2 });
    expect(res.body.checkoutCustomers).toHaveLength(1);
    expect(res.body.checkoutCustomers[0]).toMatchObject({ name: "Ravi Kumar", mobile: "9876543210", state: "Haryana" });
    expect(JSON.stringify(res.body)).not.toContain("Only Browsing");
    expect(JSON.stringify(res.body)).not.toContain("9111111111");
  });

  it("exports aggregate CSV tables without any name or phone", async () => {
    await seedDemand();
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    for (const table of ["state", "district", "pincode", "product"]) {
      const res = await request(app).get(`/api/delivery/demand/export?table=${table}&region=all`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.text).not.toContain("Ravi Kumar");
      expect(res.text).not.toContain("9876543210");
      expect(res.text).toContain("Potential value (NOT revenue)");
    }

    const bad = await request(app).get("/api/delivery/demand/export?table=customers").set("Authorization", `Bearer ${token}`);
    expect(bad.status).toBe(400);
  });
});

describe("cleanup", () => {
  it("deleting a customer removes their demand rows", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const product = await createProduct();
    await beacon({ pincode: DELHI, source: "checkout", items: [{ product: String(product._id), quantity: 1 }] }, signToken(customer));
    await beacon({ pincode: DELHI, source: "header", visitorId: VISITOR });
    expect(await DeliveryDemand.countDocuments()).toBe(2);

    const res = await request(app).delete(`/api/admin/customers/${customer._id}`).set("Authorization", `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(await DeliveryDemand.countDocuments({ user: customer._id })).toBe(0);
    expect(await DeliveryDemand.countDocuments()).toBe(1);
  });

  it("marking a browser as an internal device removes its guest demand rows", async () => {
    await beacon({ pincode: DELHI, source: "header", visitorId: VISITOR });
    await beacon({ pincode: DELHI, source: "header", visitorId: "real-shopper-0001" });

    const admin = await createUser({ role: "admin" });
    await request(app).post("/api/analytics/internal-device").set("Authorization", `Bearer ${signToken(admin)}`).send({ visitorId: VISITOR });

    expect(await DeliveryDemand.countDocuments({ visitorKey: `v:${hashVisitorId(VISITOR)}` })).toBe(0);
    expect(await DeliveryDemand.countDocuments()).toBe(1);
  });

  it("has a 365-day TTL on lastAt", async () => {
    await DeliveryDemand.syncIndexes();
    const indexes = await DeliveryDemand.collection.indexes();
    const ttl = indexes.find((index) => index.key.lastAt === 1);
    expect(ttl.expireAfterSeconds).toBe(365 * 24 * 60 * 60);
  });
});

describe("margin with missing cost", () => {
  it("shows no margin number when a counted cart has an item without cost", () => {
    const docs = [
      { _id: "a", visitorKey: "u:u1", user: "u1", source: "checkout", pincode: DELHI, state: "Delhi", district: "Central Delhi", reason: "not_serviceable", attempts: 1, lastAt: "2026-11-12T10:00:00Z", cartValue: 900, cartCost: 0, costIncomplete: true, items: [{ product: "p9", name: "Curtain", quantity: 1, unitPrice: 900, unitCost: 0 }] },
      { _id: "b", visitorKey: "u:u2", user: "u2", source: "checkout", pincode: GURGAON, state: "Haryana", district: "Gurgaon", reason: "not_serviceable", attempts: 1, lastAt: "2026-11-12T10:00:00Z", cartValue: 500, cartCost: 300, costIncomplete: false, items: [{ product: "p1", name: "Towel", quantity: 1, unitPrice: 500, unitCost: 300 }] },
    ];
    const report = buildDemandReport(docs, { region: "outside_up" });
    expect(report.totals).toMatchObject({ potentialValue: 1400, estimatedMargin: null, costIncomplete: true, incompleteCarts: 1, completeCartsValue: 500, completeCartsMargin: 200 });
    expect(report.byState.find((row) => row.state === "Delhi")).toMatchObject({ estimatedMargin: null, costIncomplete: true });
    expect(report.byState.find((row) => row.state === "Haryana")).toMatchObject({ estimatedMargin: 200, costIncomplete: false });
  });
});

describe("GET /api/delivery/demand/records (drill-down)", () => {
  it("returns individual records for a PIN, product or view, keeping identity rules", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);
    const customer = await createUser({ name: "Meena", mobile: "9222222222" });
    const browser = await createUser({ name: "Browser Only", mobile: "9333333333" });
    const towel = await createProduct({ name: "Towel", price: 250, purchasePrice: 150 });
    const sheet = await createProduct({ name: "Sheet", price: 600 });

    await beacon({ pincode: DELHI, source: "product", productId: String(towel._id), visitorId: VISITOR });
    await beacon({ pincode: DELHI, source: "product", productId: String(sheet._id) }, signToken(browser));
    await beacon({ pincode: GURGAON, source: "checkout", items: [{ product: String(towel._id), quantity: 2 }, { product: String(sheet._id), quantity: 1 }] }, signToken(customer));
    await beacon({ pincode: UNCACHED, source: "header", visitorId: VISITOR });

    const get = (qs) => request(app).get(`/api/delivery/demand/records?${qs}`).set("Authorization", `Bearer ${token}`);

    const byPin = await get(`pincode=${DELHI}`);
    expect(byPin.status).toBe(200);
    expect(byPin.body.total).toBe(2);
    expect(byPin.body.records.every((r) => r.customer === null)).toBe(true);
    expect(JSON.stringify(byPin.body)).not.toContain("9333333333");
    expect(byPin.body.records[0]).toMatchObject({ stage: "Interest (PIN check)", reasonLabel: "State restricted (outside delivery area)", sourceLabel: "Product page" });

    const carts = await get("view=carts");
    expect(carts.body.total).toBe(1);
    expect(carts.body.records[0]).toMatchObject({
      state: "Haryana",
      quantity: 3,
      cartValue: 1100,
      estimatedMargin: null, // Sheet has no purchase price
      costIncomplete: true,
      countedInPotentialValue: true,
      customer: { name: "Meena", mobile: "9222222222" },
    });
    expect(carts.body.records[0].items).toEqual([
      expect.objectContaining({ product: "Towel", quantity: 2, unitPrice: 250, unitCost: 150, lineValue: 500, lineCost: 300, lineMargin: 200 }),
      expect.objectContaining({ product: "Sheet", quantity: 1, unitCost: null, lineMargin: null }),
    ]);

    const byProduct = await get(`product=${towel._id}`);
    expect(byProduct.body.total).toBe(2);

    const byState = await get("state=haryana");
    expect(byState.body.total).toBe(1);

    // Outages are kept apart: not in the default (outside UP) view.
    const unknown = await get("region=unknown");
    expect(unknown.body.records.map((r) => r.reason)).toEqual(["unverified"]);
    const defaults = await get("");
    expect(defaults.body.records.some((r) => r.reason === "unverified")).toBe(false);
  });

  it("filters the summary by state, district and category, and lists dropdown options", async () => {
    const admin = await createUser({ role: "admin" });
    const product = await createProduct({ name: "Towel" });
    await beacon({ pincode: DELHI, source: "product", productId: String(product._id), visitorId: VISITOR });
    await beacon({ pincode: GURGAON, source: "header", visitorId: "second-browser-01" });

    const get = (qs) => request(app).get(`/api/delivery/demand/report?${qs}`).set("Authorization", `Bearer ${signToken(admin)}`);

    const all = await get("");
    expect(all.body.options.states).toEqual(["Delhi", "Haryana"]);
    expect(all.body.options.categories.map((c) => c.id)).toEqual([String(product.category)]);

    const delhi = await get("state=Delhi");
    expect(delhi.body.totals.uniqueVisitors).toBe(1);
    expect(delhi.body.byDistrict.map((r) => r.district)).toEqual(["Central Delhi"]);

    const byCategory = await get(`category=${product.category}`);
    expect(byCategory.body.byState.map((r) => r.state)).toEqual(["Delhi"]);

    const byDistrict = await get("district=Gurgaon");
    expect(byDistrict.body.byPincode.map((r) => r.pincode)).toEqual([GURGAON]);
  });
});

// ---------- Review fixes ----------
// app.js trusts exactly two proxy hops (Cloudflare edge + Render LB). In
// production the chain arrives as "<anything the client wrote>, <real
// client>, <edge>" with the LB as the TCP peer; the test socket plays the
// LB, so the last two entries here are the trusted hops' view.
const viaProxies = (clientIp, spoofed = "") =>
  [spoofed, clientIp, "10.0.0.1"].filter(Boolean).join(", ");

const guestBeacon = (visitorId, { clientIp = "49.36.10.20", spoofed = "", pincode = DELHI } = {}) =>
  request(app)
    .post("/api/delivery/demand")
    .set("User-Agent", REAL_UA)
    .set("X-Forwarded-For", viaProxies(clientIp, spoofed))
    .send({ pincode, source: "header", visitorId });

const guestId = (n) => `guest-browser-${String(n).padStart(4, "0")}`;

describe("H1 — at most 5 new guest browsers per network per day", () => {
  it("accepts 5 guest browsers from one IP, refuses the 6th and counts it only as 'limited'", async () => {
    for (let n = 1; n <= 6; n += 1) await guestBeacon(guestId(n));

    expect(await DeliveryDemand.countDocuments()).toBe(5);
    const quota = await DeliveryDemandIpDay.findOne().lean();
    expect(quota.visitors).toHaveLength(5);
    expect(quota.limitedAttempts).toBe(1);
    // Only a keyed hash of the IP is stored.
    expect(JSON.stringify(quota)).not.toContain("49.36.10.20");
    expect(quota.ipHash).toBe(hashClientIp("49.36.10.20", istTodayString()));

    const admin = await createUser({ role: "admin" });
    const res = await request(app).get("/api/delivery/demand/report").set("Authorization", `Bearer ${signToken(admin)}`);
    expect(res.body.totals.uniqueVisitors).toBe(5);
    expect(res.body.totals.limitedGuestAttempts).toBe(1);
  });

  it("keeps counting repeat checks from an already-accepted browser after the cap is full", async () => {
    for (let n = 1; n <= 5; n += 1) await guestBeacon(guestId(n));
    await guestBeacon(guestId(1));
    await guestBeacon(guestId(1), { pincode: GURGAON });

    const rows = await DeliveryDemand.find({ visitorKey: `v:${hashVisitorId(guestId(1))}` }).lean();
    expect(rows.map((r) => [r.pincode, r.attempts]).sort()).toEqual([[DELHI, 2], [GURGAON, 1]]);
    expect((await DeliveryDemandIpDay.findOne().lean()).limitedAttempts).toBe(0);
  });

  it("ignores a client-written X-Forwarded-For value: rotating it does not lift the cap", async () => {
    for (let n = 1; n <= 8; n += 1) {
      await guestBeacon(guestId(n), { spoofed: `203.0.113.${n}` });
    }
    expect(await DeliveryDemand.countDocuments()).toBe(5);
    expect(await DeliveryDemandIpDay.countDocuments()).toBe(1);
  });

  it("counts each real network separately, so one household does not block another", async () => {
    for (let n = 1; n <= 5; n += 1) await guestBeacon(guestId(n), { clientIp: "49.36.10.20" });
    await guestBeacon(guestId(6), { clientIp: "117.200.5.6" });
    expect(await DeliveryDemand.countDocuments()).toBe(6);
  });

  it("holds the cap under concurrent first requests", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => guestBeacon(guestId(i + 1))));

    expect(await DeliveryDemand.countDocuments()).toBe(5);
    const quota = await DeliveryDemandIpDay.find().lean();
    expect(quota).toHaveLength(1);
    expect(quota[0].visitors).toHaveLength(5);
    expect(quota[0].limitedAttempts).toBe(7);
  });

  it("does not cap signed-in customers (one account is one customer)", async () => {
    for (let n = 1; n <= 7; n += 1) {
      const customer = await createUser();
      await request(app)
        .post("/api/delivery/demand")
        .set("User-Agent", REAL_UA)
        .set("X-Forwarded-For", viaProxies("49.36.10.20"))
        .set("Authorization", `Bearer ${signToken(customer)}`)
        .send({ pincode: DELHI, source: "header" });
    }
    expect(await DeliveryDemand.countDocuments()).toBe(7);
  });
});

describe("H2 — cart limits and outliers", () => {
  it("caps a line at 10 units and marks the cart as an outlier (server prices)", async () => {
    const product = await createProduct({ price: 400, purchasePrice: 250 });
    const priced = await priceDemandItems([{ product: String(product._id), quantity: 50, price: 1 }]);
    expect(priced.items[0]).toMatchObject({ quantity: 10, unitPrice: 400 });
    expect(priced.cartValue).toBe(4000);
    expect(priced.outlier).toBe(true);
    expect(priced.outlierReasons.join(" ")).toMatch(/quantity above 10/);
  });

  it("keeps only 20 lines and marks the cart as an outlier", async () => {
    const products = await Promise.all(Array.from({ length: 25 }, () => createProduct({ price: 100, purchasePrice: 60 })));
    const priced = await priceDemandItems(products.map((p) => ({ product: String(p._id), quantity: 1 })));
    expect(priced.items).toHaveLength(20);
    expect(priced.outlier).toBe(true);
    expect(priced.outlierReasons.join(" ")).toMatch(/more than 20 product lines \(25\)/);
  });

  it("marks a cart worth more than ₹50,000 as an outlier, and a normal cart as not", async () => {
    const pricey = await createProduct({ price: 6000, purchasePrice: 4000 });
    const big = await priceDemandItems([{ product: String(pricey._id), quantity: 9 }]);
    expect(big).toMatchObject({ cartValue: 54000, outlier: true });
    const normal = await priceDemandItems([{ product: String(pricey._id), quantity: 2 }]);
    expect(normal).toMatchObject({ cartValue: 12000, outlier: false, outlierReasons: [] });
  });

  it("skips invalid quantities and ids", async () => {
    const product = await createProduct({ price: 100 });
    const priced = await priceDemandItems([
      { product: String(product._id), quantity: 0 },
      { product: String(product._id), quantity: 2.5 },
      { product: String(product._id), quantity: "abc" },
      { product: String(product._id), quantity: Number.MAX_SAFE_INTEGER + 2 },
      { product: { $gt: "" }, quantity: 1 },
    ]);
    expect(priced).toMatchObject({ items: [], cartValue: 0, outlier: false });
  });

  it("records an outlier cart, shows it, and keeps it out of the GST totals", async () => {
    const admin = await createUser({ role: "admin" });
    const honest = await createUser({ name: "Honest" });
    const inflater = await createUser({ name: "Inflater" });
    const product = await createProduct({ name: "Towel", price: 500, purchasePrice: 300 });

    await beacon({ pincode: DELHI, source: "checkout", items: [{ product: String(product._id), quantity: 2 }] }, signToken(honest));
    await beacon({ pincode: GURGAON, source: "checkout", items: [{ product: String(product._id), quantity: 99 }] }, signToken(inflater));

    const stored = await DeliveryDemand.findOne({ user: inflater._id }).lean();
    expect(stored).toMatchObject({ outlier: true, cartValue: 5000 });

    const token = `Bearer ${signToken(admin)}`;
    const report = await request(app).get("/api/delivery/demand/report").set("Authorization", token);
    expect(report.body.totals).toMatchObject({ checkoutCustomers: 2, potentialValue: 1000, estimatedMargin: 400, outlierCarts: 1, outlierValue: 5000 });
    expect(report.body.byState.find((r) => r.state === "Haryana")).toMatchObject({ potentialValue: 0, checkoutCustomers: 1 });
    expect(report.body.byProduct[0]).toMatchObject({ quantity: 2, potentialValue: 1000 });
    expect(report.body.checkoutCustomers.find((c) => c.name === "Inflater")).toMatchObject({ outlier: true, cartValue: 5000 });

    const carts = await request(app).get("/api/delivery/demand/records?view=carts").set("Authorization", token);
    const outlierRecord = carts.body.records.find((r) => r.state === "Haryana");
    expect(outlierRecord).toMatchObject({ outlier: true, countedInPotentialValue: false });
    expect(outlierRecord.outlierReasons.length).toBeGreaterThan(0);

    const csv = await request(app).get("/api/delivery/demand/export?table=state").set("Authorization", token);
    expect(csv.text).toMatch(/Delhi,1,1,1,1,1000,400/);
    expect(csv.text).toMatch(/Haryana,1,1,1,1,0,0/);
  });
});

describe("M1 — product/category filters count only matching cart lines", () => {
  it("does not let other products in the same cart inflate a filtered total", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const towel = await createProduct({ name: "Towel", price: 300, purchasePrice: 200 });
    const curtain = await createProduct({ name: "Curtain", price: 1200, purchasePrice: 700 });

    await beacon(
      { pincode: DELHI, source: "checkout", items: [{ product: String(towel._id), quantity: 2 }, { product: String(curtain._id), quantity: 1 }] },
      signToken(customer),
    );

    const get = (qs) => request(app).get(`/api/delivery/demand/report?${qs}`).set("Authorization", `Bearer ${signToken(admin)}`);

    const all = await get("");
    expect(all.body.totals).toMatchObject({ potentialValue: 1800, estimatedMargin: 700 });

    const towelOnly = await get(`product=${towel._id}`);
    expect(towelOnly.body.totals).toMatchObject({ potentialValue: 600, estimatedMargin: 200 });
    expect(towelOnly.body.byState[0]).toMatchObject({ potentialValue: 600 });
    expect(towelOnly.body.byProduct.map((r) => r.product)).toEqual(["Towel"]);

    const curtainCategory = await get(`category=${curtain.category}`);
    expect(curtainCategory.body.totals).toMatchObject({ potentialValue: 1200, estimatedMargin: 500 });
  });
});
