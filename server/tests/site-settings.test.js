import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import SiteSettings from "../models/SiteSettings.js";
import { createUser, signToken, createCategory } from "./helpers.js";

describe("site settings: internal pricing rules stay private", () => {
  const seed = async () => {
    const category = await createCategory();
    await SiteSettings.create({
      codCharge: 50,
      pricingRules: [{ category: category._id, miscExpensesPercent: 10, mrpMultiplier: 2.5, priceDiscountPercent: 20, isActive: true }],
    });
  };

  it("the public endpoint returns the shop settings but never the pricing rules", async () => {
    await seed();
    const res = await request(app).get("/api/settings");

    expect(res.status).toBe(200);
    expect(res.body.settings.codCharge).toBe(50);
    expect(res.body.settings.pricingRules).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/mrpMultiplier|miscExpensesPercent|priceDiscountPercent/);
  });

  it("the admin endpoint returns them, and only to an admin", async () => {
    await seed();

    expect((await request(app).get("/api/settings/admin")).status).toBe(401);

    const customer = await createUser();
    const asCustomer = await request(app).get("/api/settings/admin").set("Authorization", `Bearer ${signToken(customer)}`);
    expect(asCustomer.status).toBe(403);

    const admin = await createUser({ role: "admin" });
    const res = await request(app).get("/api/settings/admin").set("Authorization", `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.pricingRules).toHaveLength(1);
    expect(res.body.settings.pricingRules[0].mrpMultiplier).toBe(2.5);
  });
});
