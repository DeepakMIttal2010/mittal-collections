// Homepage New Arrivals teaser (src/components/NewArrivals/
// CategoryNewArrivals.jsx): first 3 admin-ordered categories x 4 products,
// category View All visible on mobile too, one language-aware "View All New
// Arrivals" link, and a skeleton of the same shape. The /new-arrivals page
// keeps 8 + Show More.
//   node --test scripts/home-new-arrivals.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const home = read("src/components/NewArrivals/CategoryNewArrivals.jsx");
const page = read("src/pages/NewArrivalsPage.jsx");

test("3 sections x 4 products, in API (admin) order, no hard-coded category", () => {
  assert.match(home, /const HOME_SECTIONS = 3;/);
  assert.match(home, /const HOME_ARRIVALS_COUNT = 4;/);
  assert.match(home, /getNewArrivalsByCategory\(HOME_ARRIVALS_COUNT\)/);
  assert.match(home, /response\.sections\.slice\(0, HOME_SECTIONS\)/);
  assert.doesNotMatch(home, /["'](bedsheets|curtains|comforters)["']/i);
});

test("category View All is not hidden on mobile and keeps the language prefix", () => {
  assert.doesNotMatch(home, /hidden sm:block/);
  assert.match(home, /to=\{`\$\{prefix\}\/category\/\$\{category\.slug\}`\}/);
});

test("one global View All New Arrivals link, after the last section, language-aware", () => {
  assert.match(home, /to=\{`\$\{prefix\}\/new-arrivals`\}/);
  assert.match(home, /t\("View All New Arrivals", "सभी नए प्रोडक्ट्स देखें"\)/);
  assert.match(home, /index === sections\.length - 1 &&/);
});

test("loading skeleton has the same shape: 3 headed sections of 4 cards", () => {
  assert.match(home, /Array\.from\(\{ length: HOME_SECTIONS \}\)/);
  assert.match(home, /<ProductGridSkeleton count=\{HOME_ARRIVALS_COUNT\} \/>/);
});

test("shared ProductGrid unchanged in use; /new-arrivals page still 8 + Show More of 40", () => {
  assert.match(home, /<ProductGrid products=\{products\} priorityCount=\{0\} \/>/);
  assert.match(page, /const PAGE_SIZE = 8;/);
  assert.match(page, /const FETCH_LIMIT = 40;/);
  assert.match(page, /t\("Show More", "और दिखाएं"\)/);
});

test("/new-arrivals page is bilingual: canonical per URL, hreflang pair, prefixed links", () => {
  assert.match(page, /url=\{`\$\{SITE_URL\}\$\{prefix\}\/new-arrivals`\}/);
  assert.match(page, /alternateLangs=\{ALTERNATE_LANGS\}/);
  assert.match(page, /lang: "hi", url: `\$\{SITE_URL\}\/hi\/new-arrivals`/);
  assert.match(page, /to=\{`\$\{prefix\}\/category\/\$\{category\.slug\}`\}/);
  assert.match(page, /path: prefix \|\| "\/"/);
});

test("nav links follow the chosen language", () => {
  for (const file of ["src/components/Navbar/Navbar.jsx", "src/components/MobileMenu.jsx"]) {
    const src = read(file);
    assert.match(src, /const newArrivalsPath = language === "hi" \? "\/hi\/new-arrivals" : "\/new-arrivals";/, file);
    assert.match(src, /to=\{newArrivalsPath\}/, file);
    assert.doesNotMatch(src, /to="\/new-arrivals"/, file);
  }
});
