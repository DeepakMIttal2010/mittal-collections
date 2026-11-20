// First-render language must come from the URL on bilingual pages, so a page
// never paints in one language and then flips to the other. The flip changed
// the mobile delivery banner from 2 lines to 1 and shifted the page
// (lab CLS 0.145 on /hi/category/cushion-covers, 0.209 on /hi/category/bedsheets,
// 0.145 on an English page for a visitor whose saved language was "hi").
//   node --test scripts/initial-language.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { initialLanguage, isBilingualPath, isHindiPath, urlLanguage } from "../src/utils/languageFromPath.js";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const HINDI_PAGES = [
  "/hi",
  "/hi/",
  "/hi/category/cushion-covers",
  "/hi/category/bedsheets/king-size",
  "/hi/product/6a853ad8b30bfcbfe6392bf2/slate-blue-wavy-ikat-cushion-covers-16x16-inches-set-of-5",
  "/hi/product/6a853ad8b30bfcbfe6392bf2",
  "/hi/articles",
  "/hi/articles/cushion-cover-size-guide-standard-sizes-what-we-stock",
  "/hi/new-arrivals",
];
const ENGLISH_PAGES = [
  "/",
  "/category/cushion-covers",
  "/category/bedsheets/king-size",
  "/product/6a853ad8b30bfcbfe6392bf2/slate-blue-wavy-ikat-cushion-covers-16x16-inches-set-of-5",
  "/articles",
  "/articles/some-guide",
  "/new-arrivals",
];
// No Hindi route exists for these, so the saved choice must still decide.
const NOT_BILINGUAL = ["/cart", "/checkout", "/account", "/wishlist", "/search", "/hi/contact", "/hi/cart", "/hindi-guide", "/trending", "/categories"];

test("Hindi bilingual URL starts in Hindi whatever was saved", () => {
  for (const path of HINDI_PAGES) {
    for (const saved of [null, "en", "hi", "garbage"]) {
      assert.equal(initialLanguage(path, saved), "hi", `${path} saved=${saved}`);
    }
  }
});

test("English bilingual URL starts in English even with a saved 'hi'", () => {
  for (const path of ENGLISH_PAGES) {
    for (const saved of [null, "en", "hi"]) {
      assert.equal(initialLanguage(path, saved), "en", `${path} saved=${saved}`);
    }
  }
});

test("pages without a Hindi route keep using the saved choice (unchanged behaviour)", () => {
  for (const path of NOT_BILINGUAL) {
    assert.equal(isBilingualPath(path), false, path);
    assert.equal(initialLanguage(path, "hi"), "hi", path);
    assert.equal(initialLanguage(path, "en"), "en", path);
    assert.equal(initialLanguage(path, null), "en", path);
    assert.equal(initialLanguage(path, "garbage"), "en", path);
  }
});

test("isHindiPath keeps its exact old rule", () => {
  for (const p of ["/hi", "/hi/", "/hi/category/x"]) assert.equal(isHindiPath(p), true, p);
  for (const p of ["/", "/hindi-guide", "/history", "", "/category/hi"]) assert.equal(isHindiPath(p), false, p);
  assert.equal(isHindiPath(), false);
  assert.equal(initialLanguage(), "en");
});

test("bilingual list matches the routes that have a /hi twin in AppRoutes", () => {
  const routes = read("src/routes/AppRoutes.jsx");
  const hiRoutes = [...routes.matchAll(/path="(\/hi[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hiRoutes.length >= 6, "found the /hi routes");
  for (const r of hiRoutes) {
    const sample = r.replace(/:\w+\?/g, "").replace(/:\w+/g, "x").replace(/\/+$/, "") || "/hi";
    assert.equal(isBilingualPath(sample), true, `${r} -> ${sample}`);
  }
});

test("reverse: every non-/hi route the allowlist accepts has a /hi twin in AppRoutes", () => {
  const routes = read("src/routes/AppRoutes.jsx");
  const sample = (r) => r.replace(/:\w+\?/g, "").replace(/:\w+/g, "x").replace(/\/+$/, "") || "/";
  const all = [...routes.matchAll(/path="([^"]*)"/g)].map((m) => m[1]).filter((r) => r.startsWith("/"));
  const hiSamples = new Set(all.filter(isHindiPath).map((r) => sample(r.slice(3) || "/")));
  const accepted = all.filter((r) => !isHindiPath(r) && !r.includes("*") && isBilingualPath(sample(r)));
  assert.ok(accepted.length >= 6, `accepted: ${accepted}`);
  for (const r of accepted) assert.ok(hiSamples.has(sample(r)), `${r} is treated as bilingual but has no /hi route`);
});

test("urlLanguage is the URL's own language", () => {
  assert.equal(urlLanguage("/hi/category/x"), "hi");
  assert.equal(urlLanguage("/hi"), "hi");
  assert.equal(urlLanguage("/category/x"), "en");
  assert.equal(urlLanguage("/hindi-guide"), "en");
});

test("LanguageContext uses the URL-first initial language and guards storage", () => {
  const src = read("src/context/LanguageContext.jsx");
  assert.match(src, /initialLanguage\(pathname, readSavedLanguage\(\)\)/);
  // re-syncs on a client-side PATH change (not on a language change)
  assert.match(src, /if \(pathname !== syncedPath\) \{/);
  assert.doesNotMatch(src, /useState\(\(\) => \{\s*return localStorage\.getItem/);
  // every storage access is inside try/catch
  const bare = src.replace(/try \{[\s\S]*?\} catch/g, "");
  assert.doesNotMatch(bare, /localStorage\./);
});
