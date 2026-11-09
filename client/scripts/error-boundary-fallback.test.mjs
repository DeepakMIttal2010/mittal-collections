// The default error screen (src/components/ErrorBoundary.jsx) must render
// even outside LanguageProvider: the top-level boundary in main.jsx wraps
// every provider, and its fallback destructuring useLanguage() threw
// ("Cannot destructure property 't' of ... undefined", Sentry), leaving a
// blank page instead of the "Reload Page" screen.
//   node --test scripts/error-boundary-fallback.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { fallbackTranslate } from "../src/utils/fallbackTranslate.js";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("fallback t(): English by default, Hindi on /hi URLs, English when no Hindi given", () => {
  for (const path of ["/", "/product/abc", "/history", "/hindi-guide", ""]) {
    assert.equal(fallbackTranslate(path)("Reload Page", "पेज रीलोड करें"), "Reload Page", path);
  }
  for (const path of ["/hi", "/hi/", "/hi/category/bedsheets"]) {
    assert.equal(fallbackTranslate(path)("Reload Page", "पेज रीलोड करें"), "पेज रीलोड करें", path);
  }
  assert.equal(fallbackTranslate("/hi")("Only English"), "Only English");
  assert.equal(fallbackTranslate()("Reload Page", "पेज रीलोड करें"), "Reload Page");
});

test("DefaultFallback no longer destructures useLanguage() and falls back without a provider", () => {
  const src = read("src/components/ErrorBoundary.jsx");
  assert.doesNotMatch(src, /const \{ t \} = useLanguage\(\);/);
  assert.match(src, /const t = useLanguage\(\)\?\.t \?\? fallbackTranslate\(window\.location\.pathname\);/);
  // Rest of the boundary unchanged: Sentry capture, placeholders, reset.
  assert.match(src, /Sentry\.captureException\(error/);
  assert.match(src, /return this\.props\.fallback \?\? <DefaultFallback \/>;/);
  assert.match(src, /prevProps\.resetKey !== this\.props\.resetKey/);
});

test("the top-level boundary really is outside LanguageProvider (why the fallback is needed)", () => {
  const main = read("src/main.jsx");
  assert.ok(main.indexOf("<ErrorBoundary>") < main.indexOf("<LanguageProvider>"));
});
