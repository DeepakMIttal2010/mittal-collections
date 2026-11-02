// oldPrice is often an internal reference price, not a printed MRP. It may
// be shown (strike-through, "MRP", % OFF) only for products an admin
// ticked "Printed MRP verified" -- src/utils/verifiedMrp.js. This file
// tests that helper and guards every customer-facing component against
// rendering oldPrice directly again.
//   node --test scripts/verified-mrp.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { verifiedMrp, verifiedDiscountPercent } from "../src/utils/verifiedMrp.js";

test("unverified or missing flag: nothing to show", () => {
  for (const p of [
    { price: 404, oldPrice: 475 },
    { mrpVerified: false, price: 404, oldPrice: 475 },
    { mrpVerified: "true", price: 404, oldPrice: 475 }, // only a real boolean counts
    null,
    undefined,
  ]) {
    assert.equal(verifiedMrp(p), 0);
    assert.equal(verifiedDiscountPercent(p), 0);
  }
});

test("verified: MRP and % off from the verified MRP", () => {
  const p = { mrpVerified: true, price: 400, oldPrice: 800 };
  assert.equal(verifiedMrp(p), 800);
  assert.equal(verifiedDiscountPercent(p), 50);
});

test("verified but selling price at or above MRP: nothing to show", () => {
  assert.equal(verifiedMrp({ mrpVerified: true, price: 800, oldPrice: 800 }), 0);
  assert.equal(verifiedMrp({ mrpVerified: true, price: 900, oldPrice: 800 }), 0);
  assert.equal(verifiedMrp({ mrpVerified: true, price: 400, oldPrice: 0 }), 0);
});

test("variants use their own prices under the product-level flag", () => {
  const product = { mrpVerified: true, price: 404, oldPrice: 475 };
  const size9x4 = { size: "9x4", price: 468, oldPrice: 550 };
  assert.equal(verifiedMrp(product, size9x4), 550);
  assert.equal(verifiedDiscountPercent(product, size9x4), 15);
  assert.equal(verifiedMrp({ ...product, mrpVerified: false }, size9x4), 0);
});

const read = (rel) => fs.readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

test("customer-facing components never render oldPrice directly", () => {
  const files = [
    "pages/ProductDetails.jsx",
    "components/ProductCard/ProductCard.jsx",
    "components/ProductCard/QuickViewModal.jsx",
    "pages/Compare.jsx",
    "components/ClearanceSale/ClearanceSale.jsx",
    "components/admin/ShareProductModal.jsx", // its posts are public
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /from "(\.\.\/)+utils\/verifiedMrp"/, `${f} must use verifiedMrp`);
    assert.doesNotMatch(src, /₹\$?\{[^}]*\.oldPrice\}/, `${f} renders oldPrice directly`);
    assert.doesNotMatch(src, /\.oldPrice\s*>\s*[a-zA-Z.]*price/i, `${f} compares oldPrice directly`);
  }
});

test("verified MRP wording carries the tax declaration in EN and HI", () => {
  for (const f of [
    "pages/ProductDetails.jsx",
    "components/ProductCard/QuickViewModal.jsx",
    "components/ProductCard/ProductCard.jsx",
  ]) {
    const src = read(f);
    assert.match(src, /"\(incl\. of all taxes\)", "\(सभी करों सहित\)"/, f);
  }
});

test("the home trust bar no longer advertises a blanket discount", () => {
  assert.doesNotMatch(read("components/TrustBar/TrustBar.jsx"), /title: "Up to \d+% OFF"/);
});

test("the home trust bar's COD item is qualified in EN and HI", () => {
  const src = read("components/TrustBar/TrustBar.jsx");
  assert.ok(src.includes('subtitle: "COD may be available for eligible PIN codes and orders."'));
  assert.ok(src.includes('subtitleHi: "COD चुनिंदा PIN codes और orders पर उपलब्ध हो सकता है।"'));
  assert.doesNotMatch(src, /Pay when it arrives|आने पर भुगतान करें/);
});

test("Clearance nav links render only when clearance has items", () => {
  for (const f of ["components/Navbar/Navbar.jsx", "components/MobileMenu.jsx"]) {
    const src = read(f);
    assert.match(src, /useHasClearance\(\)/, f);
    assert.match(src, /\{hasClearance && \(\s*<NavLink\s+to="\/clearance-sale"/, f);
  }
  // The page keeps its route but only promises a discount when it has items.
  assert.match(read("pages/ClearanceSalePage.jsx"), /\{sections\.length > 0 && \(\s*<p[^>]*>\s*\{t\(\s*"More than 35% Off/);
});

test("clearance meta description makes no blanket discount claim (React + bot prerender)", () => {
  const page = read("pages/ClearanceSalePage.jsx");
  const render = fs.readFileSync(new URL("../api/render.js", import.meta.url), "utf8");
  const text = "Clearance home furnishing items at Mittal Collections. Discounts are shown only against the MRP printed on the product, while limited stock lasts.";
  assert.ok(page.includes(text));
  assert.ok(render.includes(text));
  assert.doesNotMatch(page + render, /description="More than 35% off|"More than 35% off select/);
});

test("admin share caption uses the approved delivery wording", () => {
  const src = read("components/admin/ShareProductModal.jsx");
  assert.doesNotMatch(src, /Free Delivery in Vasundhara|COD available"/);
  assert.ok(src.includes("Delivery within 24 hours in selected Ghaziabad PIN codes, subject to product availability and order confirmation. COD may be available for eligible PIN codes and orders."));
});
