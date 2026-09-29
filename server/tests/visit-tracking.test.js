import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import PageVisit from "../models/PageVisit.js";
import { createUser, signToken } from "./helpers.js";

const LIGHTHOUSE_UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse";
const REAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("POST /api/analytics/visit — tool traffic", () => {
  it("drops PageSpeed/Lighthouse visits but keeps a real browser's", async () => {
    await request(app)
      .post("/api/analytics/visit")
      .set("User-Agent", LIGHTHOUSE_UA)
      .send({ path: "/", visitorId: "lighthouse-run" });
    await request(app)
      .post("/api/analytics/visit")
      .set("User-Agent", REAL_UA)
      .send({ path: "/", visitorId: "real-shopper" });

    expect(await PageVisit.countDocuments({ visitorId: "lighthouse-run" })).toBe(0);
    expect(await PageVisit.countDocuments({ visitorId: "real-shopper" })).toBe(1);
  });
});

describe("POST /api/analytics/internal-device", () => {
  const seed = async () => {
    await PageVisit.create([
      { path: "/", visitorId: "owner-browser-1" },
      { path: "/cart", visitorId: "owner-browser-1" },
      { path: "/", visitorId: "shopper-browser-1" },
    ]);
  };

  it("deletes only that browser's visits for an admin", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .post("/api/analytics/internal-device")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ visitorId: "owner-browser-1" });

    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    expect(await PageVisit.countDocuments({ visitorId: "owner-browser-1" })).toBe(0);
    expect(await PageVisit.countDocuments({ visitorId: "shopper-browser-1" })).toBe(1);
  });

  it("refuses a customer and an anonymous caller", async () => {
    await seed();
    const customer = await createUser();

    const asCustomer = await request(app)
      .post("/api/analytics/internal-device")
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .send({ visitorId: "shopper-browser-1" });
    const anonymous = await request(app)
      .post("/api/analytics/internal-device")
      .send({ visitorId: "shopper-browser-1" });

    expect(asCustomer.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await PageVisit.countDocuments()).toBe(3);
  });

  it("rejects a non-string visitorId instead of treating it as a query", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .post("/api/analytics/internal-device")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ visitorId: { $ne: "" } });

    expect(res.status).toBe(400);
    expect(await PageVisit.countDocuments()).toBe(3);
  });
});

describe("GET /api/admin/reports — returning visitors", () => {
  it("counts a visitor who came back on a second day inside the range", async () => {
    await PageVisit.collection.insertMany([
      { path: "/", visitorId: "came-back", createdAt: daysAgo(10) },
      { path: "/", visitorId: "came-back", createdAt: daysAgo(3) },
      { path: "/", visitorId: "one-time", createdAt: daysAgo(3) },
      { path: "/cart", visitorId: "one-time", createdAt: daysAgo(3) },
    ]);
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .get("/api/admin/reports?days=30")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.uniqueVisitors).toBe(2);
    expect(res.body.summary.returningVisitors).toBe(1);
    expect(res.body.summary.newVisitors).toBe(1);
  });
});

describe("GET /api/admin/visits — stat-tile drill-down", () => {
  const seed = async () => {
    await PageVisit.collection.insertMany([
      { path: "/", visitorId: "came-back", createdAt: daysAgo(10) },
      { path: "/cart", visitorId: "came-back", createdAt: daysAgo(3) },
      // All three of "one-time"'s visits share the same IST day (unlike
      // "came-back", spread across two) -- otherwise this visitor would
      // itself cross the 2-distinct-days threshold and be "returning".
      { path: "/", visitorId: "one-time", createdAt: daysAgo(2) },
      { path: "/cart", visitorId: "one-time", createdAt: daysAgo(2) },
      { path: "/product/xyz", visitorId: "one-time", createdAt: daysAgo(2) },
    ]);
  };

  it("view=all returns every raw visit row, matching totalVisits", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .get("/api/admin/visits?days=30&view=all")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.visits).toHaveLength(5);
  });

  it("view=unique collapses to one row per visitor, matching uniqueVisitors", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });

    const res = await request(app)
      .get("/api/admin/visits?days=30&view=unique")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.body.total).toBe(2);
    expect(res.body.visits.map((v) => v.visitorId).sort()).toEqual([
      "came-back",
      "one-time",
    ]);
  });

  it("view=new/returning agree with the reports summary's own split", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const [returning, newer, summary] = await Promise.all([
      request(app)
        .get("/api/admin/visits?days=30&view=returning")
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .get("/api/admin/visits?days=30&view=new")
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .get("/api/admin/reports?days=30")
        .set("Authorization", `Bearer ${token}`),
    ]);

    const returningIds = new Set(returning.body.visits.map((v) => v.visitorId));
    const newIds = new Set(newer.body.visits.map((v) => v.visitorId));

    expect(returningIds.has("came-back")).toBe(true);
    expect(newIds.has("one-time")).toBe(true);
    expect([...returningIds].some((id) => newIds.has(id))).toBe(false);

    // The two views' visitor counts must add up to the same
    // new+returning split the summary card itself shows.
    const uniqueReturning = new Set(returningIds).size;
    const uniqueNew = new Set(newIds).size;
    expect(uniqueReturning).toBe(summary.body.summary.returningVisitors);
    expect(uniqueNew).toBe(summary.body.summary.newVisitors);
  });

  it("search (q) matches path or visitorId, case-insensitively, without breaking on regex metacharacters", async () => {
    await seed();
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const byPath = await request(app)
      .get("/api/admin/visits?days=30&q=PRODUCT")
      .set("Authorization", `Bearer ${token}`);
    const byVisitor = await request(app)
      .get("/api/admin/visits?days=30&q=came-back")
      .set("Authorization", `Bearer ${token}`);
    const literalDots = await request(app)
      .get("/api/admin/visits?days=30&q=" + encodeURIComponent("product/xyz)("))
      .set("Authorization", `Bearer ${token}`);

    expect(byPath.body.total).toBe(1);
    expect(byPath.body.visits[0].path).toBe("/product/xyz");
    expect(byVisitor.body.total).toBe(2);
    expect(literalDots.status).toBe(200);
    expect(literalDots.body.total).toBe(0);
  });
});
