import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createUser, signToken } from "./helpers.js";

const sampleAddress = (overrides = {}) => ({
  fullName: "Test User",
  mobile: "9000000000",
  address: "123 Test Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  pincode: "201012",
  ...overrides,
});

describe("Addresses", () => {
  it("auto-sets the first address as default even if not requested", async () => {
    const user = await createUser();
    const token = signToken(user);

    const res = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleAddress());

    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
  });

  it("only one address is ever default at a time", async () => {
    const user = await createUser();
    const token = signToken(user);

    const first = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleAddress({ fullName: "First" }));

    const second = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleAddress({ fullName: "Second", isDefault: true }));

    expect(second.body.address.isDefault).toBe(true);

    const list = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${token}`);

    const defaults = list.body.addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]._id).toBe(second.body.address._id);
    // The first one, having lost default status, must reflect that.
    const reloadedFirst = list.body.addresses.find(
      (a) => a._id === first.body.address._id,
    );
    expect(reloadedFirst.isDefault).toBe(false);
  });

  it("promotes another address to default when the default one is deleted", async () => {
    const user = await createUser();
    const token = signToken(user);

    const first = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleAddress({ fullName: "First" })); // auto-default (first address)

    await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleAddress({ fullName: "Second" })); // not default

    await request(app)
      .delete(`/api/addresses/${first.body.address._id}`)
      .set("Authorization", `Bearer ${token}`);

    const list = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${token}`);

    expect(list.body.addresses).toHaveLength(1);
    expect(list.body.addresses[0].isDefault).toBe(true);
  });

  it("cannot update or delete another user's address", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const ownerToken = signToken(owner);
    const intruderToken = signToken(intruder);

    const created = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(sampleAddress());
    const addressId = created.body.address._id;

    const updateAttempt = await request(app)
      .put(`/api/addresses/${addressId}`)
      .set("Authorization", `Bearer ${intruderToken}`)
      .send({ fullName: "Hijacked" });
    expect(updateAttempt.status).toBe(404);

    const deleteAttempt = await request(app)
      .delete(`/api/addresses/${addressId}`)
      .set("Authorization", `Bearer ${intruderToken}`);
    expect(deleteAttempt.status).toBe(404);

    const stillThere = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(stillThere.body.addresses).toHaveLength(1);
    expect(stillThere.body.addresses[0].fullName).toBe("Test User");
  });
});
