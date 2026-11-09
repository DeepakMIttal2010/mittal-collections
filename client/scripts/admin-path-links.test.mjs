// Admin reports show storefront page paths (visit log, customer's recent
// visits, GA top pages) as new-tab links (src/components/admin/
// SitePathLink.jsx). Paths come from the visitor's browser or GA, so only a
// same-site "/..." path may become a link.
//   node --test scripts/admin-path-links.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const link = read("src/components/admin/SitePathLink.jsx");

// isSitePath's own source, evaluated as written.
const isSitePath = new Function(
  `${link.match(/export const isSitePath = ([\s\S]*?\n\s*.*?);\n/)[0].replace("export const isSitePath", "const isSitePath")} return isSitePath;`,
)();

test("only same-site paths become links", () => {
  for (const ok of ["/", "/hi", "/product/abc/slug", "/category/bedsheets/king-size?x=1", "/hi/new-arrivals"]) {
    assert.equal(isSitePath(ok), true, ok);
  }
  for (const bad of ["//evil.com", "//evil.com/x", "javascript:alert(1)", "https://evil.com", "product/abc", "", null, undefined, 42, { path: "/" }]) {
    assert.equal(isSitePath(bad), false, String(bad));
  }
});

test("link opens in a new tab without opener access; non-paths render as text", () => {
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /if \(!isSitePath\(path\)\) return <span className=\{className\}>\{path\}<\/span>;/);
});

test("used in the visit log, the customer's recent visits and GA top pages", () => {
  const reports = read("src/pages/admin/AdminReports.jsx");
  const customer = read("src/pages/admin/CustomerDetails.jsx");
  assert.match(reports, /<SitePathLink path=\{v\.path\} \/>/);
  assert.match(reports, /items=\{googleReport\.analytics\.topPages\}\s*labelKey="path"\s*linkLabel/);
  assert.match(reports, /linkLabel \? \(\s*<SitePathLink path=\{item\[labelKey\]\}/);
  assert.match(customer, /<SitePathLink path=\{visit\.path\} \/>/);
  // Other ranked lists (channels, devices) stay plain text.
  assert.doesNotMatch(reports, /items=\{googleReport\.analytics\.byChannel\}\s*labelKey="channel"\s*linkLabel/);
  assert.doesNotMatch(reports, /items=\{googleReport\.analytics\.byDevice\}\s*labelKey="label"\s*linkLabel/);
});
