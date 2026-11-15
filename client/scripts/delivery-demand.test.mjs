// PR-B2 Delivery Demand: product page, header and checkout note an
// "unavailable" PIN for the admin report, without changing what the
// shopper sees; the admin page keeps filters in the URL and drills down.
//   node --test scripts/delivery-demand.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const service = read("src/services/deliveryService.js");
const checker = read("src/components/PincodeChecker.jsx");
const checkout = read("src/pages/Checkout.jsx");
const page = read("src/pages/admin/AdminDeliveryDemand.jsx");

test("beacon is fire-and-forget and skips staff, internal and automated browsers", () => {
  assert.match(service, /export const recordDeliveryDemand = \(/);
  assert.match(service, /if \(isInternalDevice\(\) \|\| navigator\.webdriver \|\| isAdminLoggedIn\(\)\) return;/);
  assert.match(service, /storedUser\?\.role === "admin"\) return;/);
  assert.match(service, /\/delivery\/demand`/);
  assert.match(service, /\.catch\(\(\) => \{\}\)/);
  // The existing check is untouched.
  assert.match(service, /`\$\{API_BASE_URL\}\/delivery\/check-pincode\/\$\{pincode\}`/);
});

test("PincodeChecker records only an unavailable answer, only when a source is given", () => {
  assert.match(checker, /demandSource = null, productId = null/);
  assert.match(
    checker,
    /response\.deliverable === false && response\.reason !== "invalid"\) \{[\s\S]*?if \(demandSource\) recordDeliveryDemand\(\{ pincode, source: demandSource, productId \}\);/,
  );
  assert.match(read("src/components/Header/Header.jsx"), /<PincodeChecker demandSource="header" \/>/);
  assert.match(read("src/pages/ProductDetails.jsx"), /demandSource="product"\s+productId=\{product\._id\}/);
});

test("checkout notes the blocked cart but keeps the block", () => {
  assert.match(
    checkout,
    /setDeliveryUnavailable\(\{[\s\S]*?\}\);\s+\/\/ PR-B2[\s\S]*?recordDeliveryDemand\(\{[\s\S]*?source: "checkout",[\s\S]*?\}\);\s+\}\s+return;/,
  );
  assert.match(checkout, /cartItemsRef\.current\.map/);
  // No price is sent; the server prices the cart.
  assert.doesNotMatch(checkout.slice(checkout.indexOf("cartItemsRef.current.map"), checkout.indexOf("cartItemsRef.current.map") + 300), /price/);
});

test("admin page: URL filters, clickable tiles/rows, back to summary, NOT-revenue labels", () => {
  assert.match(page, /useSearchParams/);
  assert.match(page, /POTENTIAL VALUE – NOT REVENUE/);
  assert.match(page, /ESTIMATED MARGIN – NOT ACTUAL PROFIT/);
  assert.match(page, /Margin Data Incomplete/);
  assert.match(page, /Back to Summary/);
  assert.equal((page.match(/<KpiTile/g) || []).length, 5);
  assert.match(page, /onRowClick=\{\(row\) => setParam\(\{ state: row\.state, district: "", pincode: "" \}\)\}/);
  assert.match(page, /onRowClick=\{\(row\) => setParam\(\{ state: row\.state, district: row\.district, pincode: "" \}\)\}/);
  assert.match(page, /onRowClick=\{\(row\) => setParam\(\{ pincode: row\.pincode, view: "records" \}\)\}/);
  assert.match(page, /onRowClick=\{\(row\) => setParam\(\{ product: row\.productId, view: "records" \}\)\}/);
  assert.match(page, /CSV \(totals only\)/);
});

test("route, sidebar and permission key exist", () => {
  assert.match(read("src/routes/AppRoutes.jsx"), /<Route path="delivery-demand" element=\{<AdminDeliveryDemand \/>\} \/>/);
  assert.match(read("src/components/admin/AdminSidebar.jsx"), /to: "\/admin\/delivery-demand"/);
  assert.match(read("src/config/adminPermissions.js"), /key: "delivery-demand", label: "Delivery Demand", to: "\/admin\/delivery-demand"/);
});

test("review fixes: browser-based label, list-price disclosure, outliers and limited checks shown", () => {
  assert.match(page, /label="Unique Visitors \(Browser-based\)"/);
  assert.match(
    page,
    /"List-price based estimate – before coupons, bundle discounts, delivery charges and COD charges\. NOT REVENUE\."/,
  );
  assert.match(page, /label="Potential cart value" value=\{rupees\(totals\.potentialValue\)\} note=\{VALUE_BASIS\}/);
  assert.match(page, /NOT ACTUAL PROFIT/);
  assert.match(page, /Outlier carts \(not in totals\)/);
  assert.match(page, /Outlier – not in totals/);
  assert.match(page, /totals\.limitedGuestAttempts/);
});

test("UI polish: wider Product/cart column, Customer next to Place, descriptive CSV file names", () => {
  assert.match(page, /min-w-\[20rem\]">Product \/ cart<\/th>/);
  assert.match(page, />Place<\/th>\s*<th[^>]*>Customer<\/th>/);
  assert.match(page, /"delivery-demand",\s*table,\s*filters\.region \|\| "outside_up",/);
  assert.match(page, /downloadDeliveryDemandCsv\(table, filters, filename\)/);
  const csvService = read("src/services/deliveryDemandService.js");
  assert.match(csvService, /const name = filename \|\| `delivery-demand-\$\{table\}\.csv`;/);
});
