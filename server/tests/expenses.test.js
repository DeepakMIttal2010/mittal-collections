import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Expense from "../models/Expense.js";
import RecurringExpense from "../models/RecurringExpense.js";
import Role from "../models/Role.js";
import { createUser, signToken } from "./helpers.js";
import {
  generateDueRecurringExpenses,
  parseIstDate,
  toIstDateString,
} from "../utils/recurringExpenses.js";

const adminAuth = async () => {
  const admin = await createUser({ role: "admin" });
  return { Authorization: `Bearer ${signToken(admin)}` };
};

const staffAuth = async (permissions) => {
  const role = await Role.create({ name: `Role ${permissions.join("-") || "none"}`, permissions });
  const staff = await createUser({ role: "admin", adminRole: role._id });
  return { Authorization: `Bearer ${signToken(staff)}` };
};

const validExpense = (overrides = {}) => ({
  date: "2026-10-05",
  category: "Packaging",
  amount: 120.5,
  vendor: "Local shop",
  note: "Poly bags",
  paymentMode: "UPI",
  ...overrides,
});

const template = (overrides = {}) => ({
  name: "Claude subscription",
  category: "Software & Subscriptions",
  amount: 2500,
  billing: "monthly",
  startDate: "2026-07-28",
  vendor: "Anthropic",
  paymentMode: "Card",
  ...overrides,
});

const createTemplateDoc = (overrides = {}) =>
  RecurringExpense.create({
    name: "Claude subscription",
    category: "Software & Subscriptions",
    amount: 2500,
    billing: "monthly",
    startDate: parseIstDate("2026-07-28"),
    ...overrides,
  });

const istNow = (iso) => new Date(iso);

describe("expenses: access control", () => {
  it("rejects anonymous, customer, and staff without the expenses permission", async () => {
    expect((await request(app).get("/api/admin/expenses")).status).toBe(401);

    const customer = await createUser();
    const asCustomer = await request(app)
      .get("/api/admin/expenses")
      .set("Authorization", `Bearer ${signToken(customer)}`);
    expect(asCustomer.status).toBe(403);

    const noPerm = await staffAuth(["orders"]);
    expect((await request(app).get("/api/admin/expenses").set(noPerm)).status).toBe(403);
    expect((await request(app).post("/api/admin/expenses").set(noPerm).send(validExpense())).status).toBe(403);
    expect((await request(app).get("/api/admin/expenses/recurring").set(noPerm)).status).toBe(403);
    expect(await Expense.countDocuments({})).toBe(0);
  });

  it("allows staff whose role has the expenses permission", async () => {
    const ok = await staffAuth(["expenses"]);
    expect((await request(app).get("/api/admin/expenses").set(ok)).status).toBe(200);
  });
});

describe("expenses: create / update / delete", () => {
  it("creates an expense and keeps the calendar date (no timezone shift)", async () => {
    const auth = await adminAuth();
    const res = await request(app).post("/api/admin/expenses").set(auth).send(validExpense({ date: "2026-10-01" }));

    expect(res.status).toBe(201);
    expect(res.body.expense.amount).toBe(120.5);
    expect(toIstDateString(new Date(res.body.expense.date))).toBe("2026-10-01");
  });

  it("rejects invalid input and stores nothing", async () => {
    const auth = await adminAuth();
    const bad = [
      validExpense({ category: "Made up" }),
      validExpense({ category: undefined }),
      validExpense({ amount: 0 }),
      validExpense({ amount: -5 }),
      validExpense({ amount: "120" }),
      validExpense({ amount: 1e9 }),
      validExpense({ date: "2026-02-31" }),
      validExpense({ date: "05-10-2026" }),
      validExpense({ date: "2019-12-31" }),
      validExpense({ date: undefined }),
      validExpense({ paymentMode: "Barter" }),
      validExpense({ note: "x".repeat(301) }),
      validExpense({ vendor: "x".repeat(101) }),
      validExpense({ vendor: { $gt: "" } }),
    ];

    for (const body of bad) {
      const res = await request(app).post("/api/admin/expenses").set(auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await Expense.countDocuments({})).toBe(0);
  });

  it("updates fields partially, and rejects bad values or empty updates", async () => {
    const auth = await adminAuth();
    const created = await request(app).post("/api/admin/expenses").set(auth).send(validExpense());
    const id = created.body.expense._id;

    const ok = await request(app).put(`/api/admin/expenses/${id}`).set(auth).send({ amount: 200, note: "  Updated " });
    expect(ok.status).toBe(200);
    expect(ok.body.expense.amount).toBe(200);
    expect(ok.body.expense.note).toBe("Updated");
    expect(ok.body.expense.category).toBe("Packaging");

    expect((await request(app).put(`/api/admin/expenses/${id}`).set(auth).send({ amount: -1 })).status).toBe(400);
    expect((await request(app).put(`/api/admin/expenses/${id}`).set(auth).send({ date: "2026-13-01" })).status).toBe(400);
    expect((await request(app).put(`/api/admin/expenses/${id}`).set(auth).send({})).status).toBe(400);
    expect((await request(app).put("/api/admin/expenses/64b000000000000000000000").set(auth).send({ amount: 1 })).status).toBe(404);
    expect((await request(app).put("/api/admin/expenses/not-an-id").set(auth).send({ amount: 1 })).status).toBe(400);
  });

  it("deletes a hand-entered expense outright", async () => {
    const auth = await adminAuth();
    const created = await request(app).post("/api/admin/expenses").set(auth).send(validExpense());
    const id = created.body.expense._id;

    expect((await request(app).delete(`/api/admin/expenses/${id}`).set(auth)).status).toBe(200);
    expect(await Expense.countDocuments({})).toBe(0);
    expect((await request(app).delete(`/api/admin/expenses/${id}`).set(auth)).status).toBe(404);
  });
});

describe("expenses: list, filters and totals", () => {
  it("filters by inclusive date range and category, and totals by category", async () => {
    const auth = await adminAuth();
    const rows = [
      validExpense({ date: "2026-09-30", category: "Packaging", amount: 10 }),
      validExpense({ date: "2026-10-01", category: "Packaging", amount: 20 }),
      validExpense({ date: "2026-10-31", category: "Marketing & Ads", amount: 30.25 }),
      validExpense({ date: "2026-11-01", category: "Packaging", amount: 40 }),
    ];
    for (const r of rows) await request(app).post("/api/admin/expenses").set(auth).send(r);

    const october = await request(app).get("/api/admin/expenses?from=2026-10-01&to=2026-10-31").set(auth);
    expect(october.status).toBe(200);
    expect(october.body.expenses).toHaveLength(2);
    expect(october.body.totals.total).toBe(50.25);
    expect(october.body.totals.byCategory).toEqual(
      expect.arrayContaining([
        { category: "Packaging", total: 20, count: 1 },
        { category: "Marketing & Ads", total: 30.25, count: 1 },
      ]),
    );

    const onlyPackaging = await request(app).get("/api/admin/expenses?category=Packaging").set(auth);
    expect(onlyPackaging.body.expenses).toHaveLength(3);
    expect(onlyPackaging.body.totals.total).toBe(70);
  });

  it("rejects malformed or injected query params", async () => {
    const auth = await adminAuth();

    for (const qs of ["from=2026-02-31", "to=garbage", "category=Nope"]) {
      const res = await request(app).get(`/api/admin/expenses?${qs}`).set(auth);
      expect(res.status, qs).toBe(400);
    }

    // Operator-style params (`category[$ne]=...`) must never act as a Mongo
    // operator: either rejected (400), or -- when a sanitizer strips the
    // `$` key before it reaches the controller -- served as if the filter
    // was absent. Seeing only the non-matching rows would mean it worked.
    await request(app).post("/api/admin/expenses").set(auth).send(validExpense({ category: "Packaging" }));
    await request(app).post("/api/admin/expenses").set(auth).send(validExpense({ category: "Marketing & Ads" }));

    for (const qs of ["category[$ne]=Packaging", "from[$gt]=2020-01-01", "to[$lt]=2020-01-01"]) {
      const res = await request(app).get(`/api/admin/expenses?${qs}`).set(auth);
      expect([200, 400], qs).toContain(res.status);
      if (res.status === 200) expect(res.body.expenses, qs).toHaveLength(2);
    }
  });
});

describe("recurring expenses: generation", () => {
  it("backfills Claude monthly from 28 Jul up to the current month, never future-dated", async () => {
    await createTemplateDoc();

    const created = await generateDueRecurringExpenses(istNow("2026-10-21T08:00:00+05:30"));
    expect(created).toBe(3);

    const dates = (await Expense.find({}).sort({ date: 1 })).map((e) => toIstDateString(e.date));
    expect(dates).toEqual(["2026-07-28", "2026-08-28", "2026-09-28"]);
  });

  it("creates this month's entry once its day arrives (IST, not UTC)", async () => {
    await createTemplateDoc();

    // 27 Oct 19:00 UTC = 28 Oct 00:30 IST -> the 28 Oct charge is due.
    await generateDueRecurringExpenses(istNow("2026-10-27T19:00:00Z"));
    const dates = (await Expense.find({}).sort({ date: 1 })).map((e) => toIstDateString(e.date));
    expect(dates).toContain("2026-10-28");

    // ...but 27 Oct 18:00 UTC = 27 Oct 23:30 IST is still the day before.
    await Expense.deleteMany({});
    await generateDueRecurringExpenses(istNow("2026-10-27T18:00:00Z"));
    const before = (await Expense.find({})).map((e) => toIstDateString(e.date));
    expect(before).not.toContain("2026-10-28");
  });

  it("is idempotent, including two runs at the same time", async () => {
    await createTemplateDoc();
    const now = istNow("2026-10-21T08:00:00+05:30");

    await Promise.all([generateDueRecurringExpenses(now), generateDueRecurringExpenses(now)]);
    await generateDueRecurringExpenses(now);

    expect(await Expense.countDocuments({})).toBe(3);
  });

  it("starts ChatGPT from 8 Oct and spreads a yearly price over 12 months", async () => {
    await createTemplateDoc({ name: "ChatGPT", amount: 399, startDate: parseIstDate("2026-10-08") });
    await createTemplateDoc({
      name: "Domain",
      category: "Domain & Hosting",
      amount: 1000,
      billing: "yearly-spread",
      startDate: parseIstDate("2026-10-01"),
    });

    await generateDueRecurringExpenses(istNow("2026-10-21T08:00:00+05:30"));

    const chatgpt = await Expense.find({ amount: 399 });
    expect(chatgpt).toHaveLength(1);
    expect(toIstDateString(chatgpt[0].date)).toBe("2026-10-08");

    const domain = await Expense.find({ category: "Domain & Hosting" });
    expect(domain).toHaveLength(1);
    expect(domain[0].amount).toBe(83.33);
  });

  it("clamps the day to the month's length (31st in February)", async () => {
    await createTemplateDoc({ startDate: parseIstDate("2026-01-31") });

    await generateDueRecurringExpenses(istNow("2026-03-15T08:00:00+05:30"));

    const dates = (await Expense.find({}).sort({ date: 1 })).map((e) => toIstDateString(e.date));
    expect(dates).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("never overwrites an edited entry, and never recreates a voided one", async () => {
    await createTemplateDoc();
    const now = istNow("2026-10-21T08:00:00+05:30");
    await generateDueRecurringExpenses(now);

    const [aug] = await Expense.find({}).sort({ date: 1 }).skip(1).limit(1);
    await Expense.updateOne({ _id: aug._id }, { amount: 2412.5 });

    const [sep] = await Expense.find({}).sort({ date: 1 }).skip(2).limit(1);
    const auth = await adminAuth();
    expect((await request(app).delete(`/api/admin/expenses/${sep._id}`).set(auth)).status).toBe(200);

    await generateDueRecurringExpenses(now);

    expect((await Expense.findById(aug._id)).amount).toBe(2412.5);
    expect(await Expense.countDocuments({})).toBe(3);
    expect((await Expense.findById(sep._id)).voided).toBe(true);

    const list = await request(app).get("/api/admin/expenses").set(auth);
    expect(list.body.expenses.map((e) => e._id)).not.toContain(String(sep._id));
    expect((await request(app).put(`/api/admin/expenses/${sep._id}`).set(auth).send({ amount: 1 })).status).toBe(404);
  });

  it("skips inactive templates and stops at the end date", async () => {
    await createTemplateDoc({ name: "Stopped", isActive: false });
    await createTemplateDoc({ name: "Ends early", endDate: parseIstDate("2026-08-31") });

    await generateDueRecurringExpenses(istNow("2026-10-21T08:00:00+05:30"));

    const dates = (await Expense.find({}).sort({ date: 1 })).map((e) => toIstDateString(e.date));
    expect(dates).toEqual(["2026-07-28", "2026-08-28"]);
  });
});

describe("recurring expenses: API", () => {
  it("creating a template backfills its past months straight away", async () => {
    const auth = await adminAuth();
    const res = await request(app).post("/api/admin/expenses/recurring").set(auth).send(template({ startDate: "2026-07-28" }));
    expect(res.status).toBe(201);

    const list = await request(app).get("/api/admin/expenses").set(auth);
    expect(list.body.expenses.length).toBeGreaterThanOrEqual(3);
    for (const e of list.body.expenses) {
      expect(toIstDateString(new Date(e.date)) <= toIstDateString(new Date())).toBe(true);
      expect(e.amount).toBe(2500);
      expect(e.recurringTemplate).toBe(res.body.template._id);
    }
  });

  it("validates templates", async () => {
    const auth = await adminAuth();
    const bad = [
      template({ name: "" }),
      template({ name: undefined }),
      template({ amount: 0 }),
      template({ billing: "weekly" }),
      template({ startDate: "2026-02-30" }),
      template({ startDate: "2099-01-01" }),
      template({ category: "Nope" }),
      template({ endDate: "garbage" }),
      template({ isActive: "yes" }),
    ];

    for (const body of bad) {
      const res = await request(app).post("/api/admin/expenses/recurring").set(auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await RecurringExpense.countDocuments({})).toBe(0);
  });

  it("deactivating stops future entries but keeps generated ones", async () => {
    const auth = await adminAuth();
    const created = await request(app).post("/api/admin/expenses/recurring").set(auth).send(template({ startDate: "2026-07-28" }));
    const id = created.body.template._id;
    const before = await Expense.countDocuments({});

    const res = await request(app).delete(`/api/admin/expenses/recurring/${id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.template.isActive).toBe(false);
    expect(await Expense.countDocuments({})).toBe(before);

    await RecurringExpense.updateOne({ _id: id }, { startDate: parseIstDate("2020-01-01") });
    await request(app).get("/api/admin/expenses").set(auth);
    expect(await Expense.countDocuments({})).toBe(before);

    const listed = await request(app).get("/api/admin/expenses/recurring").set(auth);
    expect(listed.body.templates).toHaveLength(1);
  });

  it("updating a template changes only months not generated yet", async () => {
    const auth = await adminAuth();
    const created = await request(app).post("/api/admin/expenses/recurring").set(auth).send(template({ startDate: "2026-07-28" }));
    const id = created.body.template._id;
    const before = await Expense.find({}).lean();

    const res = await request(app).put(`/api/admin/expenses/recurring/${id}`).set(auth).send({ amount: 3000 });
    expect(res.status).toBe(200);
    expect(res.body.template.amount).toBe(3000);

    const after = await Expense.find({}).lean();
    expect(after).toHaveLength(before.length);
    expect(after.every((e) => e.amount === 2500)).toBe(true);
  });
});
