import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Role from "../models/Role.js";
import { createUser, signToken, createProduct, createOrder } from "./helpers.js";

// The Order Receipt pages (/my-orders/:id/receipt, /admin/orders/:id/receipt)
// read GET /api/orders/:id. Only the order's owner or an admin with the
// "orders" permission may read it, and it must carry every saved value the
// receipt shows.
const get = (id, user) => {
  const req = request(app).get(`/api/orders/${id}`);
  return user ? req.set("Authorization", `Bearer ${signToken(user)}`) : req;
};

describe("GET /api/orders/:id for the receipt", () => {
  const setup = async () => {
    const owner = await createUser();
    const product = await createProduct({ price: 399 });
    const order = await createOrder({
      user: owner,
      products: [product],
      overrides: {
        deliveryFee: 9,
        codCharge: 50,
        couponCode: "WELCOME10",
        discountAmount: 40,
        pointsDiscount: 10,
        pointsRedeemed: 10,
        totalPrice: 408,
        refundedAmount: 0,
        paymentMethod: "COD",
      },
    });
    return { owner, order };
  };

  it("the owner gets the order with every saved receipt value", async () => {
    const { owner, order } = await setup();
    const res = await get(order._id, owner);
    expect(res.status).toBe(200);
    const o = res.body.order;
    expect(o.orderItems[0]).toMatchObject({ price: 399, quantity: 1 });
    expect(o).toMatchObject({
      totalPrice: 408, deliveryFee: 9, codCharge: 50, couponCode: "WELCOME10",
      discountAmount: 40, pointsDiscount: 10, pointsRedeemed: 10, refundedAmount: 0, paymentMethod: "COD",
    });
    expect(o.shippingAddress).toMatchObject({ fullName: "Test User", pincode: "201001" });
  });

  it("another customer and a staff admin without the orders permission are refused", async () => {
    const { order } = await setup();
    expect((await get(order._id)).status).toBe(401);
    expect((await get(order._id, await createUser())).status).toBe(403);

    const noOrders = await Role.create({ name: "Products only", permissions: ["products"] });
    const staff = await createUser({ role: "admin", adminRole: noOrders._id });
    expect((await get(order._id, staff)).status).toBe(403);
  });

  it("an admin with the orders permission can read it (for printing)", async () => {
    const { order } = await setup();
    const role = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });
    expect((await get(order._id, staff)).status).toBe(200);
    expect((await get(order._id, await createUser({ role: "admin" }))).status).toBe(200);
  });
});
