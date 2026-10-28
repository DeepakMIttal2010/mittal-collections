import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Role from "../models/Role.js";
import User from "../models/User.js";
import { createUser, signToken } from "./helpers.js";

// Who may grant Full Admin (an admin with no Role) and who may edit a
// Role — deep bug sweep round 30. Only an existing Full Admin may grant
// Full Admin; a restricted "roles" holder must stay inside its own
// ceiling both when assigning and when editing roles.

let roleCounter = 0;

const createRole = (permissions, writeAccess = []) => {
  roleCounter += 1;
  return Role.create({ name: `Role ${roleCounter}`, permissions, writeAccess });
};

const createStaff = async (role) => createUser({ role: "admin", adminRole: role?._id ?? null });

const newStaffBody = (overrides = {}) => {
  roleCounter += 1;
  return {
    name: "New Staff",
    email: `new-staff-${roleCounter}@example.com`,
    password: "secret123",
    ...overrides,
  };
};

describe("Granting Full Admin", () => {
  it("rejects a restricted staff account holding roles + staff-users creating a Full Admin", async () => {
    const callerRole = await createRole(["roles", "staff-users"]);
    const caller = await createStaff(callerRole);

    for (const adminRole of ["", null, undefined]) {
      const body = newStaffBody({ adminRole });
      const res = await request(app)
        .post("/api/admin/staff")
        .set("Authorization", `Bearer ${signToken(caller)}`)
        .send(body);

      expect(res.status).toBe(403);
      expect(await User.findOne({ email: body.email })).toBeNull();
    }
  });

  it("rejects a restricted staff account promoting another staff account to Full Admin", async () => {
    const callerRole = await createRole(["roles", "staff-users"]);
    const caller = await createStaff(callerRole);
    const targetRole = await createRole(["roles"]);
    const target = await createStaff(targetRole);

    const res = await request(app)
      .put(`/api/admin/staff/${target._id}`)
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ adminRole: null });

    expect(res.status).toBe(403);
    expect(String((await User.findById(target._id)).adminRole)).toBe(String(targetRole._id));
  });

  it("still lets a restricted staff account assign a role within its own access", async () => {
    const callerRole = await createRole(["roles", "staff-users", "orders"]);
    const caller = await createStaff(callerRole);
    const narrowRole = await createRole(["orders"]);
    const body = newStaffBody({ adminRole: String(narrowRole._id) });

    const res = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send(body);

    expect(res.status).toBe(201);
    const created = await User.findOne({ email: body.email });
    expect(String(created.adminRole)).toBe(String(narrowRole._id));
  });

  it("lets a Full Admin create and promote Full Admins", async () => {
    const owner = await createStaff(null);

    const body = newStaffBody({ adminRole: "" });
    const created = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${signToken(owner)}`)
      .send(body);

    expect(created.status).toBe(201);
    expect((await User.findOne({ email: body.email })).adminRole).toBeNull();

    const target = await createStaff(await createRole(["orders"]));
    const promoted = await request(app)
      .put(`/api/admin/staff/${target._id}`)
      .set("Authorization", `Bearer ${signToken(owner)}`)
      .send({ adminRole: null });

    expect(promoted.status).toBe(200);
    expect((await User.findById(target._id)).adminRole).toBeNull();
  });
});

describe("Editing a role", () => {
  it("rejects a restricted roles holder editing a role broader than its own access", async () => {
    const caller = await createStaff(await createRole(["roles"]));
    const broadRole = await createRole(["roles", "orders", "reports"]);

    const res = await request(app)
      .put(`/api/roles/${broadRole._id}`)
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ permissions: ["roles"] });

    expect(res.status).toBe(403);
    const unchanged = await Role.findById(broadRole._id);
    expect([...unchanged.permissions].sort()).toEqual(["orders", "reports", "roles"]);
  });

  it("lets a restricted roles holder edit a role within its own access", async () => {
    const caller = await createStaff(await createRole(["roles", "orders"]));
    const narrowRole = await createRole(["orders"]);

    const res = await request(app)
      .put(`/api/roles/${narrowRole._id}`)
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ permissions: ["orders", "roles"] });

    expect(res.status).toBe(200);
    expect([...(await Role.findById(narrowRole._id)).permissions].sort()).toEqual(["orders", "roles"]);
  });

  it("lets a Full Admin edit any role", async () => {
    const owner = await createStaff(null);
    const broadRole = await createRole(["roles", "orders", "reports"]);

    const res = await request(app)
      .put(`/api/roles/${broadRole._id}`)
      .set("Authorization", `Bearer ${signToken(owner)}`)
      .send({ permissions: ["orders"] });

    expect(res.status).toBe(200);
    expect([...(await Role.findById(broadRole._id)).permissions]).toEqual(["orders"]);
  });
});
