// Order Receipt (src/utils/orderReceipt.js + components/OrderReceipt):
// built only from values saved on the order, the payable total is the
// saved totalPrice, refunds are shown separately, zero lines are hidden,
// cancelled orders get no receipt, and no GST / tax-invoice wording.
//   node --test scripts/order-receipt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildReceipt, isReceiptAvailable, receiptReference } from "../src/utils/orderReceipt.js";

const base = {
  _id: "6ae3756694c8e85b4a7f8670",
  orderStatus: "Delivered",
  orderItems: [
    { name: "Tulip Single Comforter", size: "", price: 399, quantity: 2 },
    { name: "Doormat", size: "15x22", price: 187, quantity: 1 },
  ],
  deliveryFee: 0,
  codCharge: 0,
  discountAmount: 0,
  bundleDiscountAmount: 0,
  pointsDiscount: 0,
  refundedAmount: 0,
  totalPrice: 985,
};
const keys = (r) => r.lines.map((l) => l.key);

test("plain order: item amounts, items total and saved total; zero lines hidden", () => {
  const r = buildReceipt(base);
  assert.deepEqual(r.items.map((i) => i.amount), [798, 187]);
  assert.deepEqual(keys(r), ["itemsTotal"]);
  assert.equal(r.lines[0].amount, 985);
  assert.equal(r.total, 985);
  assert.equal(r.consistent, true);
});

test("coupon, bundle, points, delivery and COD lines explain the saved total", () => {
  const order = {
    ...base,
    couponCode: "WELCOME10", discountAmount: 98,
    bundleDiscountAmount: 44, bundleDiscountPercent: 5,
    pointsDiscount: 20, pointsRedeemed: 20,
    deliveryFee: 9, codCharge: 50,
    totalPrice: 985 - 98 - 44 - 20 + 9 + 50,
  };
  const r = buildReceipt(order);
  assert.deepEqual(keys(r), ["itemsTotal", "coupon", "bundle", "points", "delivery", "cod"]);
  assert.deepEqual(r.lines.map((l) => l.amount), [985, -98, -44, -20, 9, 50]);
  assert.equal(r.lines[1].code, "WELCOME10");
  assert.equal(r.lines[2].percent, 5);
  assert.equal(r.lines[3].points, 20);
  assert.equal(r.total, 882);
  assert.equal(r.consistent, true);
});

test("a refund is listed separately and never changes the order total", () => {
  const r = buildReceipt({ ...base, refundedAmount: 187 });
  assert.equal(r.refunded, 187);
  assert.equal(r.total, 985);
  assert.equal(r.consistent, true);
});

test("the saved total is shown even if the breakdown can't explain it", () => {
  const r = buildReceipt({ ...base, totalPrice: 900 });
  assert.equal(r.total, 900);
  assert.equal(r.consistent, false);
});

test("missing or odd values never produce NaN", () => {
  const r = buildReceipt({ orderStatus: "Pending", orderItems: [{ name: "X", price: "abc", quantity: null }] });
  assert.equal(r.items[0].amount, 0);
  assert.equal(r.total, 0);
  assert.ok(!JSON.stringify(r).includes("NaN"));
});

test("cancelled orders have no receipt; the reference is the short order number", () => {
  assert.equal(isReceiptAvailable({ ...base, orderStatus: "Cancelled" }), false);
  assert.equal(isReceiptAvailable(base), true);
  assert.equal(isReceiptAvailable(null), false);
  assert.equal(receiptReference(base._id), "#4A7F8670");
});

const read = (rel) => fs.readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

test("the receipt shows the saved total, no GST or tax-invoice wording", () => {
  const src = read("components/OrderReceipt/OrderReceipt.jsx");
  assert.match(src, /rupees\(r\.total\)/);
  assert.match(src, /isReceiptAvailable\(order\)/);
  // The only mention allowed is the header comment explaining the omission.
  const code = src.replace(/^\/\/.*$/gm, "");
  assert.doesNotMatch(code, /GST|Tax Invoice|Bill of Supply|Cash Memo|Invoice No/i);
  assert.match(src, /t\("Order Receipt", "ऑर्डर रसीद"\)/);
  assert.match(src, /onClick=\{\(\) => window\.print\(\)\}/);
});

test("printing hides everything but the receipt (display:none, no blank pages)", () => {
  const css = read("components/OrderReceipt/OrderReceipt.css");
  assert.match(css, /body\.receipt-print-mode \*:not\(:has\(\.order-receipt\)\):not\(\.order-receipt\):not\(\.order-receipt \*\) \{\s*display: none !important;/);
  assert.match(read("components/OrderReceipt/OrderReceipt.jsx"), /document\.body\.classList\.add\("receipt-print-mode"\)[\s\S]*classList\.remove\("receipt-print-mode"\)/);
});

test("receipt links are routed and hidden for cancelled orders", () => {
  const routes = read("routes/AppRoutes.jsx");
  assert.match(routes, /path="\/my-orders\/:id\/receipt" element=\{<OrderReceiptPage \/>\}/);
  assert.match(routes, /path="orders\/:id\/receipt" element=\{<AdminOrderReceipt \/>\}/);
  assert.match(read("pages/OrderDetails.jsx"), /order\.orderStatus !== "Cancelled" && \(\s*<Link\s+to=\{`\/my-orders\/\$\{order\._id\}\/receipt`\}/);
  assert.match(read("pages/admin/AdminOrders.jsx"), /order\.orderStatus !== "Cancelled" && \(\s*<Link\s+to=\{`\/admin\/orders\/\$\{order\._id\}\/receipt`\}/);
});
