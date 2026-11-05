// First-load route preload (src/routes/AppRoutes.jsx preloadableRoute +
// src/main.jsx): product/category pages must render their real component on
// the first commit so MainLayout never paints below render.js's prepaint
// placeholder (CLS ~0.5), while a slow or failed chunk falls back to the
// normal lazy route instead of holding the page back.
//   node --test scripts/route-preload.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Normalised so the source checks behave the same on CRLF (Windows) checkouts.
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const routes = read("src/routes/AppRoutes.jsx");
const main = read("src/main.jsx");

// Runs the helper's real source with only its JSX return swapped for a plain
// object, so preload timing is exercised without a DOM or a JSX transform.
const JSX_RETURN = "return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;";
const helperSrc = routes.match(/function preloadableRoute\(importer\) \{[\s\S]*?\n\}\n/)[0];
const LAZY = { lazy: true };
const makeRoute = (importer) =>
  new Function(
    "lazyWithReload",
    `${helperSrc.replace(JSX_RETURN, "return Loaded ? { type: Loaded, props } : { type: Lazy, props };")}
     return preloadableRoute;`,
  )(() => LAZY)(importer);
const Real = () => null;
const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

test("helper source still has the expected JSX return", () => {
  assert.ok(helperSrc.includes(JSX_RETURN));
});

test("without a preload the route is the normal lazy route", () => {
  const Route = makeRoute(() => Promise.resolve({ default: Real }));
  assert.equal(Route({}).type, LAZY);
});

test("a successful preload renders the real component, not the lazy fallback", async () => {
  const Route = makeRoute(() => Promise.resolve({ default: Real }));
  await Route.preload(1000);
  assert.equal(Route({}).type, Real);
});

test("a preload that misses the timeout keeps the lazy route, even after the chunk arrives", async () => {
  const Route = makeRoute(() => later(50, { default: Real }));
  await Route.preload(10);
  assert.equal(Route({}).type, LAZY);
  await later(80);
  assert.equal(Route({}).type, LAZY, "late chunk must not swap components mid-life");
});

test("a failed import resolves the preload and keeps the lazy route", async () => {
  const Route = makeRoute(() => Promise.reject(new Error("chunk failed")));
  await assert.doesNotReject(Route.preload(100));
  assert.equal(Route({}).type, LAZY);
});

const PRELOADABLE = ["ProductDetails", "CategoryPage", "TrendingPage", "ClearanceSalePage", "NewArrivalsPage", "GiftingPage"];

test("only product/category and the four landing pages are preloadable; other routes stay lazy", () => {
  for (const name of PRELOADABLE) {
    assert.ok(
      routes.includes(`export const ${name} = preloadableRoute(() => import("../pages/${name}"));`),
      name,
    );
  }
  assert.equal((routes.match(/= preloadableRoute\(/g) || []).length, PRELOADABLE.length);
  assert.match(routes, /const SearchResults = lazyWithReload\(/);
  assert.match(routes, /const ArticleDetail = lazyWithReload\(/);
  assert.match(routes, /const PriceRangePage = lazyWithReload\(/);
});

// The PRELOAD_ROUTES table from main.jsx, evaluated as written.
const table = main.match(/const PRELOAD_ROUTES = (\[[\s\S]*?\n\]);/)[1];
const routeFor = (pathname) => {
  const rows = new Function(...PRELOADABLE, `return ${table};`)(...PRELOADABLE);
  return rows.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
};

test("main.jsx picks the right route chunk for each first-load URL", () => {
  const cases = {
    "/product/abc/slug": "ProductDetails",
    "/hi/product/abc": "ProductDetails",
    "/category/bedsheets": "CategoryPage",
    "/hi/category/bedsheets/double": "CategoryPage",
    "/trending": "TrendingPage",
    "/clearance-sale": "ClearanceSalePage",
    "/new-arrivals": "NewArrivalsPage",
    "/new-arrivals/": "NewArrivalsPage",
    "/hi/new-arrivals": "NewArrivalsPage",
    "/gifting": "GiftingPage",
    "/": null,
    "/hi": null,
    "/trending-now": null,
    "/hi/trending": null,
    "/search": null,
    "/articles": null,
  };
  for (const [pathname, expected] of Object.entries(cases)) {
    assert.equal(routeFor(pathname), expected, pathname);
  }
});

test("main.jsx preloads that one chunk, capped at 3 s, before the first render", () => {
  assert.match(main, /const ROUTE_PRELOAD_TIMEOUT_MS = 3000;/);
  assert.match(main, /initialRoute\.preload\(ROUTE_PRELOAD_TIMEOUT_MS\)\s*: Promise\.resolve\(\)\s*\)\.then\(renderApp\);/);
  // The only createRoot call is inside renderApp.
  assert.equal((main.match(/createRoot\(/g) || []).length, 1);
  assert.match(main, /function renderApp\(\) \{\s*ReactDOM\.createRoot\(/);
});

test("the Hindi New Arrivals URL has its own route", () => {
  assert.match(routes, /<Route path="\/hi\/new-arrivals" element=\{<NewArrivalsPage \/>\} \/>/);
});
