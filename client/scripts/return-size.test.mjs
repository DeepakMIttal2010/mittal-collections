// A return request must say which SIZE of the product is coming back: one
// order can hold the same product in more than one size, each its own line
// with its own price. The service used to drop the size the modal passed,
// and My Orders marked every size of a product "Return requested" once one
// size was returned (deep bug sweep M1-B, 2026-11-13).
//   node --test scripts/return-size.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const createBody = () => {
  const service = read("src/services/returnService.js");
  const fn = service.match(/export const createReturnRequest = async \(\{([^}]*)\}\) => \{[\s\S]*?\n\};/);
  assert.ok(fn, "createReturnRequest found");
  return { params: fn[1], body: fn[0].match(/body: JSON\.stringify\(\{([^}]*)\}\)/)?.[1] || "" };
};

test("the return service takes a size and sends it in the request body", () => {
  const { params, body } = createBody();

  assert.match(params, /\bsize\b/);
  assert.match(body, /\bsize\b/);
  for (const field of ["orderId", "productId", "quantity", "reason"]) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `${field} still sent`);
  }
});

test("a call without a size leaves it out of the body, as before", () => {
  // The service sends JSON.stringify({ ..., size }); an absent size is dropped.
  assert.equal(
    JSON.stringify({ orderId: "o", productId: "p", quantity: 1, reason: "r", size: undefined }),
    '{"orderId":"o","productId":"p","quantity":1,"reason":"r"}',
  );
});

test("the return modal passes the order line's size", () => {
  const modal = read("src/components/ReturnRequestModal.jsx");
  const call = modal.match(/createReturnRequest\(\{([\s\S]*?)\}\)/);

  assert.ok(call, "modal calls createReturnRequest");
  assert.match(call[1], /size:\s*item\.size/);
});

test("My Orders marks a return as requested per product AND size", () => {
  const page = read("src/pages/MyOrders.jsx");

  assert.doesNotMatch(page, /returnedProductIds/);
  assert.match(page, /`\$\{item\.product\}\|\$\{item\.size \|\| ""\}`/);
});
