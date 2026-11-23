// Ghaziabad store page audit 2026-11-23 (GZ-02/03/05). The page's static
// copy lives in src/utils/ghaziabadStoreCopy.js (EN + HI); api/render.js
// mirrors the English for bots (see render-ghaziabad-store.test.mjs).
//   node --test scripts/ghaziabad-store-copy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  GHAZIABAD_COPY,
  GHAZIABAD_COPY_EN,
  RETURNS_POLICY_PATH,
  WALK_IN_OPEN,
  listableCategories,
  walkInNote,
} from "../src/utils/ghaziabadStoreCopy.js";

// Every en/hi pair in the copy, in document order.
const pairs = [];
const walk = (v) => {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === "object") {
    if ("en" in v && "hi" in v) return pairs.push(v);
    Object.values(v).forEach(walk);
  }
};
walk(GHAZIABAD_COPY);
const allEn = pairs.map((p) => p.en).join(" ");
const allHi = pairs.map((p) => p.hi).join(" ");

test("GZ-02/03: no 'real photos' promise and no 'hassle-free returns' in EN or HI", () => {
  assert.doesNotMatch(allEn, /real photos|what you see is exactly|hassle-free|stand behind every order/i);
  assert.doesNotMatch(allHi, /असली फोटो|जो आप देखते हैं|झंझट/);
});

test("GZ-03: returns bullet links the Returns Policy page (not the logged-in /returns page)", () => {
  assert.equal(RETURNS_POLICY_PATH, "/policies/returns");
  const links = GHAZIABAD_COPY.bullets.flat().filter((part) => part.path);
  assert.equal(links.length, 1);
  assert.equal(links[0].path, "/policies/returns");
  const en = GHAZIABAD_COPY.bullets.map((b) => b.map((p) => p.en).join(""));
  assert.ok(
    en.includes(
      "Returns are available on eligible products. Please check our Returns Policy for product-wise eligibility and details.",
    ),
  );
  const hi = GHAZIABAD_COPY.bullets.map((b) => b.map((p) => p.hi).join(""));
  assert.ok(
    hi.includes(
      "योग्य प्रोडक्ट्स पर रिटर्न उपलब्ध है। प्रोडक्ट के हिसाब से योग्यता और पूरी जानकारी के लिए हमारी रिटर्न पॉलिसी देखें।",
    ),
  );
});

test("four bullets, 'since 2021' kept (owner confirmed 2026-11-23)", () => {
  assert.equal(GHAZIABAD_COPY.bullets.length, 4);
  assert.match(allEn, /Trusted by Ghaziabad families since 2021\./);
});

test("GZ-05: one walk-in switch; note shown while closed, gone when open", () => {
  assert.equal(WALK_IN_OPEN, false);
  assert.deepEqual(walkInNote(false), GHAZIABAD_COPY.visit.walkInNote);
  assert.equal(walkInNote(true), null);
  assert.match(walkInNote(false).en, /not accepting walk-ins/);
});

test("GHAZIABAD_COPY_EN is exactly the English side of GHAZIABAD_COPY; every string has Hindi", () => {
  const pick = (v) => {
    if (Array.isArray(v)) return v.map(pick);
    if (v && typeof v === "object") {
      if ("en" in v && "hi" in v) return v.path ? { text: v.en, path: v.path } : v.en;
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pick(x)]));
    }
    return v;
  };
  assert.deepEqual(GHAZIABAD_COPY_EN, pick(GHAZIABAD_COPY));
  assert.ok(pairs.length > 15);
  for (const p of pairs) if (p.en.trim()) assert.match(p.hi, /[ऀ-ॿ]/, p.en);
});

test("listableCategories keeps active categories with a slug and name, in API order", () => {
  const cats = [
    { slug: "bedsheets", name: "Bedsheets", isActive: true },
    { slug: "old", name: "Old", isActive: false },
    { slug: "", name: "Empty" },
    { name: "No slug" },
    { slug: "towels", name: "" },
    null,
    { slug: "towels", name: "Towels" },
  ];
  assert.deepEqual(listableCategories(cats).map((c) => c.slug), ["bedsheets", "towels"]);
  assert.deepEqual(listableCategories(undefined), []);
});
