import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createUser, signToken } from "./helpers.js";

describe("Customer deletion guards", () => {
  it("blocks deleting a customer who referred another customer (would silently no-op a future loyalty clawback)", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);

    const referrer = await createUser();
    await createUser({ referredBy: referrer._id });

    const res = await request(app)
      .delete(`/api/admin/customers/${referrer._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/referred other customers/i);
  });

  it("allows deleting a customer with no orders and no referrals", async () => {
    const admin = await createUser({ role: "admin" });
    const adminToken = signToken(admin);

    const customer = await createUser();

    const res = await request(app)
      .delete(`/api/admin/customers/${customer._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});
