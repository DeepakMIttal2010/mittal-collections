import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// PR-9a (AM-03): central admin audit log. Every write (non-GET) request
// made by a logged-in admin -- Full Admin or restricted staff -- leaves
// one entry: who, which route, which record, the result code, and the
// NAMES of the submitted fields. Never values, headers, IP, query string
// or uploaded-file details. Customer and unauthenticated requests, GETs
// and the "seen"/"read" markers are not logged. Owner decisions D1-D6
// (2026-11-26): 2-year retention, failed attempts logged, names only,
// Full Admin-only read access, read-only UI, no IP.
//
// The collection is read directly (mongoose model "AdminAuditLog" ->
// collection "adminauditlogs") so these tests don't depend on the model
// file existing; the model is imported dynamically only where a test is
// about the model itself.

vi.mock("../config/mailer.js", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
// Same pass-through as stable-slugs.test.js: no Cloudinary in tests.
vi.mock("../middleware/imageOptimizer.js", () => ({
  default: (req, _res, next) => {
    if (req.file) req.file.path = "https://example.com/uploaded-proof-url.jpg";
    next();
  },
}));

import "./setup.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Role from "../models/Role.js";
import ContactMessage from "../models/ContactMessage.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const COLLECTION = "adminauditlogs";
const TWO_YEARS_SECONDS = 63072000; // 730 days (D1)

const auditCollection = () => mongoose.connection.collection(COLLECTION);
const allEntries = () => auditCollection().find({}).sort({ createdAt: 1 }).toArray();
const loadModel = async () => (await import("../models/AdminAuditLog.js")).default;

// The entry is written after the response, so poll briefly for it.
const waitForEntries = async (count, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  let entries = await allEntries();
  while (entries.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    entries = await allEntries();
  }
  return entries;
};

// For "nothing is logged" checks: give a would-be write time to land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

let roleCounter = 0;
const createRole = (permissions) => {
  roleCounter += 1;
  return Role.create({ name: `Audit Role ${roleCounter}`, permissions, writeAccess: [] });
};

const makeOrder = async ({ paymentMethod = "COD", ...overrides } = {}) => {
  const customer = await createUser();
  const product = await createProduct({ stock: 5 });
  return Order.create({
    user: customer._id,
    orderItems: [{ product: product._id, name: product.name, image: product.image, price: 999, quantity: 1 }],
    shippingAddress: {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201001",
    },
    paymentMethod,
    ...(paymentMethod === "Razorpay" && { razorpayOrderId: `order_audit_${Date.now()}_${Math.random()}` }),
    totalPrice: 999,
    orderStatus: "Pending",
    statusHistory: [{ status: "Pending", changedAt: new Date() }],
    ...overrides,
  });
};

const setStatus = (token, order, status, query = "") =>
  request(app)
    .put(`/api/orders/${order._id}/status${query}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status });

let fullAdmin;
let fullAdminToken;
beforeEach(async () => {
  fullAdmin = await createUser({ role: "admin", name: "Owner Admin" });
  fullAdminToken = signToken(fullAdmin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PR-9a: admin writes are recorded", () => {
  it("1. a Full Admin order status change creates one entry with actor, route, record, result and field names", async () => {
    const order = await makeOrder();
    const res = await setStatus(fullAdminToken, order, "Processing");
    expect(res.status).toBe(200);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(String(entry.actor?.id)).toBe(String(fullAdmin._id));
    expect(entry.actor?.name).toBe("Owner Admin");
    expect(entry.actor?.fullAdmin).toBe(true);
    expect(entry.actor?.roleName ?? null).toBeNull();
    expect(entry.method).toBe("PUT");
    expect(entry.route).toBe("/api/orders/:id/status");
    expect(entry.path).toBe(`/api/orders/${order._id}/status`);
    expect(entry.entity).toBe("orders");
    expect(entry.entityId).toBe(String(order._id));
    expect(entry.statusCode).toBe(200);
    expect(entry.outcome).toBe("success");
    expect(entry.fields).toEqual(["status"]);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it("2. a rejected admin write is recorded as failed with its code (D2)", async () => {
    // Unpaid Razorpay -> Processing is refused by the D3 payment lock.
    const order = await makeOrder({ paymentMethod: "Razorpay" });
    const res = await setStatus(fullAdminToken, order, "Processing");
    expect(res.status).toBe(400);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].statusCode).toBe(400);
    expect(entries[0].outcome).toBe("failed");
    expect(entries[0].entityId).toBe(String(order._id));
  });

  it("3. a restricted staff member refused for a missing permission (403) is recorded", async () => {
    const role = await createRole(["products"]);
    const staff = await createUser({ role: "admin", adminRole: role._id, name: "Shop Staff" });
    const order = await makeOrder();

    const res = await setStatus(signToken(staff), order, "Processing");
    expect(res.status).toBe(403);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect(String(entries[0].actor?.id)).toBe(String(staff._id));
    expect(entries[0].actor?.fullAdmin).toBe(false);
    expect(entries[0].actor?.roleName).toBe(role.name);
    expect(entries[0].statusCode).toBe(403);
    expect(entries[0].outcome).toBe("failed");
    expect((await Order.findById(order._id)).orderStatus).toBe("Pending");
  });
});

describe("PR-9a: no secrets or personal data in entries", () => {
  it("4. creating a staff user logs the field name 'password' but never its value or the token", async () => {
    const secret = "Zx9-Unique-Secret-Value-4471";
    const res = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${fullAdminToken}`)
      .send({ name: "New Staff Person", email: "new-staff-audit@example.com", mobile: "9876500000", password: secret });
    expect(res.status).toBe(201);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect([...entries[0].fields].sort()).toEqual(["email", "mobile", "name", "password"]);

    const stored = JSON.stringify(entries);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(fullAdminToken);
    expect(stored).not.toMatch(/bearer/i);
    expect(stored).not.toMatch(/authorization/i);
    // D3: no values at all in 9a -- not even harmless ones.
    expect(stored).not.toContain("new-staff-audit@example.com");
    expect(stored).not.toContain("New Staff Person");
    expect(stored).not.toContain("9876500000");
  });

  it("5. a POS sale with a payment-proof upload stores no file name, path, URL or file field", async () => {
    const product = await createProduct({ price: 100, stock: 10 });
    const res = await request(app)
      .post("/api/admin/pos/sale")
      .set("Authorization", `Bearer ${fullAdminToken}`)
      .field("items", JSON.stringify([{ productId: product._id.toString(), quantity: 1, unitPrice: 100 }]))
      .field("paymentMethod", "Cash")
      .attach("paymentProof", Buffer.from("fake-image-bytes"), {
        filename: "proof-private-name.jpg",
        contentType: "image/jpeg",
      });
    expect(res.status).toBe(201);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    expect([...entries[0].fields].sort()).toEqual(["items", "paymentMethod"]);

    const stored = JSON.stringify(entries);
    expect(stored).not.toContain("proof-private-name");
    expect(stored).not.toContain("uploaded-proof-url");
    expect(stored).not.toContain("paymentProof");
    expect(stored).not.toContain("image/jpeg");
  });

  it("11. an entry holds only the allowed fields: no IP, headers, query string or values", async () => {
    const order = await makeOrder();
    const res = await setStatus(fullAdminToken, order, "Processing", "?token=q-secret-123&x=1");
    expect(res.status).toBe(200);

    const entries = await waitForEntries(1);
    expect(entries).toHaveLength(1);
    const [entry] = entries;

    const allowed = ["_id", "__v", "actor", "method", "route", "path", "entity", "entityId", "statusCode", "outcome", "fields", "createdAt"];
    expect(Object.keys(entry).filter((key) => !allowed.includes(key))).toEqual([]);
    expect(Object.keys(entry.actor).filter((key) => !["id", "name", "fullAdmin", "roleName"].includes(key))).toEqual([]);
    expect(entry.path).toBe(`/api/orders/${order._id}/status`);

    const stored = JSON.stringify(entry);
    expect(stored).not.toContain("q-secret-123");
    expect(stored).not.toContain("?");
    expect(stored).not.toContain("Processing"); // the submitted value
    expect(stored).not.toMatch(/"ip"|127\.0\.0\.1|::1|::ffff/);
    expect(stored).not.toMatch(/user-agent|authorization|cookie/i);
  });
});

describe("PR-9a guards: what is NOT logged", () => {
  it("6. requests without a valid login (401) and failed logins create no entry", async () => {
    const order = await makeOrder();
    expect((await request(app).put(`/api/orders/${order._id}/status`).send({ status: "Processing" })).status).toBe(401);
    expect(
      (await request(app).put(`/api/orders/${order._id}/status`).set("Authorization", "Bearer not-a-real-token").send({ status: "Processing" })).status,
    ).toBe(401);

    const login = await request(app).post("/api/auth/login").send({ email: fullAdmin.email, password: "wrong-password-1" });
    expect(login.status).toBeGreaterThanOrEqual(400);

    await settle();
    expect(await allEntries()).toHaveLength(0);
  });

  it("7. customer requests -- their own writes and attempts on admin routes -- create no entry", async () => {
    const customer = await createUser();
    const token = signToken(customer);

    await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Asha", mobile: "9000000001", address: "1 Road", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201001" });

    const order = await makeOrder();
    expect((await setStatus(token, order, "Processing")).status).toBe(403);

    await settle();
    expect(await allEntries()).toHaveLength(0);
  });

  it("8. admin GET requests create no entry", async () => {
    expect((await request(app).get("/api/orders").set("Authorization", `Bearer ${fullAdminToken}`)).status).toBe(200);
    expect((await request(app).get("/api/admin/customers").set("Authorization", `Bearer ${fullAdminToken}`)).status).toBe(200);

    await settle();
    expect(await allEntries()).toHaveLength(0);
  });

  it("9. seen/read markers create no entry", async () => {
    const order = await makeOrder();
    const message = await ContactMessage.create({ name: "Visitor", email: "visitor@example.com", subject: "Question", message: "Hello there, a question." });

    expect((await request(app).put(`/api/orders/${order._id}/seen`).set("Authorization", `Bearer ${fullAdminToken}`)).status).toBe(200);
    expect((await request(app).put(`/api/contact/${message._id}/read`).set("Authorization", `Bearer ${fullAdminToken}`)).status).toBe(200);
    expect((await request(app).put("/api/admin/notifications/mark-all-read").set("Authorization", `Bearer ${fullAdminToken}`)).status).toBe(200);

    await settle();
    expect(await allEntries()).toHaveLength(0);
  });
});

describe("PR-9a: a failing log never breaks the admin action", () => {
  it("10. if the audit insert fails, the status change still succeeds and is saved", async () => {
    const Collection = mongoose.mongo.Collection.prototype;
    const realInsertOne = Collection.insertOne;
    const realInsertMany = Collection.insertMany;
    let attempts = 0;
    const failForAudit = (real) =>
      function patched(...args) {
        if (this.collectionName === COLLECTION) {
          attempts += 1;
          return Promise.reject(new Error("simulated audit write failure"));
        }
        return real.apply(this, args);
      };
    vi.spyOn(Collection, "insertOne").mockImplementation(failForAudit(realInsertOne));
    vi.spyOn(Collection, "insertMany").mockImplementation(failForAudit(realInsertMany));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const order = await makeOrder();
    const res = await setStatus(fullAdminToken, order, "Processing");

    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("Processing");

    const deadline = Date.now() + 3000;
    while (attempts === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(attempts).toBeGreaterThan(0); // the hook really tried to write
    expect(consoleError).toHaveBeenCalled(); // and reported the failure
  });

  it("17. the failure log shows only a safe error type and code, never the error's message or properties", async () => {
    const SECRET = "pw=Hunter2-Secret-XYZ mongodb://user:pass@db-host:27017";
    const makeError = (name, code) =>
      Object.assign(new Error(`DBMSG-LEAK-MARKER ${SECRET}`), { name, code, errmsg: SECRET, keyValue: { password: SECRET } });
    const errors = [
      makeError("MongoServerError", 11000), // normal: name + numeric code kept
      makeError(`Evil ${SECRET}`, `bad code ${SECRET}`), // unsafe name/code: replaced
    ];

    const Collection = mongoose.mongo.Collection.prototype;
    const realInsertOne = Collection.insertOne;
    let attempt = 0;
    vi.spyOn(Collection, "insertOne").mockImplementation(function patched(...args) {
      if (this.collectionName === COLLECTION) {
        const error = errors[Math.min(attempt, errors.length - 1)];
        attempt += 1;
        return Promise.reject(error);
      }
      return realInsertOne.apply(this, args);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < errors.length; i += 1) {
      const order = await makeOrder();
      expect((await setStatus(fullAdminToken, order, "Processing")).status).toBe(200);
      const deadline = Date.now() + 3000;
      while (attempt <= i && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // Let both catch handlers run.
    await settle();

    const auditLines = consoleError.mock.calls
      .map((args) => args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg) ?? String(arg))).join(" "))
      .filter((line) => line.includes("Admin audit log write failed"));
    expect(auditLines).toHaveLength(2);

    // Every argument is a plain string -- no error object handed to the logger.
    for (const call of consoleError.mock.calls.filter((args) => String(args[0]).includes("Admin audit log"))) {
      for (const arg of call) expect(typeof arg).toBe("string");
    }
    for (const line of auditLines) {
      expect(line).not.toContain("Hunter2");
      expect(line).not.toContain("mongodb://");
      expect(line).not.toContain("db-host");
      expect(line).not.toContain("DBMSG-LEAK-MARKER");
      expect(line).toContain("PUT /api/orders/:id/status");
    }
    expect(auditLines[0]).toContain("MongoServerError (code: 11000)");
    expect(auditLines[1]).toContain("Error (code: none)");
  });
});

describe("PR-9a: read API -- Full Admin only, read-only", () => {
  const seed = (entries) =>
    auditCollection().insertMany(
      entries.map((entry) => ({
        actor: { id: fullAdmin._id, name: "Owner Admin", fullAdmin: true, roleName: null },
        method: "PUT",
        route: "/api/orders/:id/status",
        statusCode: 200,
        outcome: "success",
        fields: ["status"],
        ...entry,
      })),
    );

  const list = (query, token = fullAdminToken) =>
    request(app).get(`/api/admin/audit-log${query}`).set("Authorization", `Bearer ${token}`);

  it("12. returns entries newest first, with filters and capped pagination", async () => {
    const otherAdmin = await createUser({ role: "admin" });
    const orderId = new mongoose.Types.ObjectId().toString();
    await seed([
      { entity: "orders", entityId: orderId, path: `/api/orders/${orderId}/status`, createdAt: new Date("2026-11-01T10:00:00Z") },
      { entity: "orders", entityId: orderId, path: `/api/orders/${orderId}/status`, createdAt: new Date("2026-11-10T10:00:00Z") },
      { entity: "products", entityId: "p1", route: "/api/products/:id", path: "/api/products/p1", createdAt: new Date("2026-11-05T10:00:00Z") },
      {
        entity: "coupons", entityId: "c1", route: "/api/coupons/:id", path: "/api/coupons/c1", createdAt: new Date("2026-11-20T10:00:00Z"),
        actor: { id: otherAdmin._id, name: "Other Admin", fullAdmin: true, roleName: null },
      },
    ]);

    const all = await list("");
    expect(all.status).toBe(200);
    expect(all.body.success).toBe(true);
    expect(all.body.total).toBe(4);
    expect(all.body.entries.map((e) => e.entity)).toEqual(["coupons", "orders", "products", "orders"]);

    const byRecord = await list(`?entity=orders&entityId=${orderId}`);
    expect(byRecord.body.entries).toHaveLength(2);

    const byActor = await list(`?actor=${otherAdmin._id}`);
    expect(byActor.body.entries.map((e) => e.entity)).toEqual(["coupons"]);

    const byDate = await list("?from=2026-11-04T00:00:00Z&to=2026-11-15T00:00:00Z");
    expect(byDate.body.entries.map((e) => e.entity)).toEqual(["orders", "products"]);

    const page2 = await list("?limit=3&page=2");
    expect(page2.body.page).toBe(2);
    expect(page2.body.limit).toBe(3);
    expect(page2.body.totalPages).toBe(2);
    expect(page2.body.entries).toHaveLength(1);

    const capped = await list("?limit=500");
    expect(capped.body.limit).toBe(100);
  });

  it("13. restricted staff (even with every permission), customers and anonymous callers cannot read it", async () => {
    const everything = await createRole(["staff-users", "roles", "settings", "orders", "reports", "accounts"]);
    const staff = await createUser({ role: "admin", adminRole: everything._id });
    const customer = await createUser();

    expect((await list("", signToken(staff))).status).toBe(403);
    expect((await list("", signToken(customer))).status).toBe(403);
    expect((await request(app).get("/api/admin/audit-log")).status).toBe(401);
  });

  it("14. there is no API to create, edit or delete entries", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const auth = { Authorization: `Bearer ${fullAdminToken}` };
    for (const [method, url] of [
      ["post", "/api/admin/audit-log"],
      ["put", `/api/admin/audit-log/${id}`],
      ["patch", `/api/admin/audit-log/${id}`],
      ["delete", `/api/admin/audit-log/${id}`],
      ["delete", "/api/admin/audit-log"],
    ]) {
      const res = await request(app)[method](url).set(auth).send({});
      expect(res.status, `${method} ${url}`).toBe(404);
    }
  });
});

describe("PR-9a: model rules", () => {
  it("15. the model refuses updates and deletes (application-level append-only)", async () => {
    // Application-level protection only: anyone with direct database
    // access can still change the collection. Not a tamper-proof store.
    const AdminAuditLog = await loadModel();
    const entry = await AdminAuditLog.create({
      actor: { id: fullAdmin._id, name: "Owner Admin", fullAdmin: true, roleName: null },
      method: "PUT",
      route: "/api/orders/:id/status",
      path: "/api/orders/x/status",
      entity: "orders",
      entityId: "x",
      statusCode: 200,
      outcome: "success",
      fields: ["status"],
    });

    const attempts = {
      updateOne: () => AdminAuditLog.updateOne({ _id: entry._id }, { $set: { statusCode: 500 } }),
      updateMany: () => AdminAuditLog.updateMany({}, { $set: { statusCode: 500 } }),
      findOneAndUpdate: () => AdminAuditLog.findOneAndUpdate({ _id: entry._id }, { $set: { statusCode: 500 } }),
      replaceOne: () => AdminAuditLog.replaceOne({ _id: entry._id }, { method: "POST" }),
      deleteOne: () => AdminAuditLog.deleteOne({ _id: entry._id }),
      deleteMany: () => AdminAuditLog.deleteMany({}),
      findOneAndDelete: () => AdminAuditLog.findOneAndDelete({ _id: entry._id }),
      documentSave: async () => {
        const doc = await AdminAuditLog.findById(entry._id);
        doc.statusCode = 500;
        return doc.save();
      },
      documentDelete: async () => (await AdminAuditLog.findById(entry._id)).deleteOne(),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      await expect(attempt(), name).rejects.toThrow();
    }

    const after = await auditCollection().findOne({ _id: entry._id });
    expect(after.statusCode).toBe(200);
  });

  it("16. entries expire after 2 years via a TTL index on createdAt (D1)", async () => {
    const AdminAuditLog = await loadModel();
    await AdminAuditLog.init(); // build the declared indexes
    const indexes = await auditCollection().indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);
    expect(ttl?.key).toEqual({ createdAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(TWO_YEARS_SECONDS);
  });
});
