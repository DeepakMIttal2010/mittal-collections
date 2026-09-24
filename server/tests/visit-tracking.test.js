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
