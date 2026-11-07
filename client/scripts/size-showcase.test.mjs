// Homepage "<Category> by Size" section: src/utils/sizeShowcase.js picks
// the rows and size cards; SubcategoryRow.jsx renders real links, one-card
// arrows, a hidden scrollbar and a Hindi group label.
//   node --test scripts/size-showcase.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { HOME_SIZE_ROWS, groupLabelHi, selectSizeRows } from "../src/utils/sizeShowcase.js";

const cat = (slug, name = slug) => ({ _id: `c-${slug}`, slug, name });
const sub = (slug, name, extra = {}) => ({
  _id: `s-${slug}-${name}`,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  groupLabel: "Size",
  displayOrder: 0,
  productCount: 0,
  category: { _id: `c-${slug}` },
  ...extra,
});

const CATEGORIES = ["bedsheets", "curtains", "comforters", "doormats", "dohars", "hotel-linen", "toys"].map((s) => cat(s));
// Live-shaped data (2026-11-05): 8 bedsheet sizes with ties in displayOrder.
const BEDSHEETS = [
  ["Diwan Bed Size", 0, 4], ["70 x 90 Inches", 0, 3], ["Double Bed Size", 1, 47], ["72 x 100 Inches", 1, 1],
  ["88 x 88 Inches", 2, 8], ["King Size", 2, 17], ["91 x 98 Inches", 3, 20], ["93 x 108 Inches", 4, 10],
].map(([name, displayOrder, productCount]) => sub("bedsheets", name, { groupLabel: "Bed Size", displayOrder, productCount }));
const SUBS = [
  ...BEDSHEETS,
  sub("curtains", "9x4 Ft", { displayOrder: 1, productCount: 23 }),
  sub("curtains", "7x4 Ft", { displayOrder: 0, productCount: 23 }),
  ...["90 x 50 Inches", "Single Bed Size", "Double Bed Size", "90 x 72 Inches"].map((n, i) => sub("comforters", n, { displayOrder: Math.floor(i / 2) })),
  ...[2, 3, 4, 5, 6].map((o) => sub("doormats", `Mat ${o}`, { displayOrder: o })),
  sub("dohars", "60 x 90 Inches"),
  sub("hotel-linen", "Double Bed Size"),
  sub("bedsheets", "Cotton", { groupLabel: "Material", productCount: 99 }),
];
const names = (row) => row.items.map((i) => i.name);

test("exactly the 4 configured rows, in configured order; other categories dropped", () => {
  const rows = selectSizeRows(CATEGORIES, SUBS);
  assert.deepEqual(rows.map((r) => r.category.slug), ["bedsheets", "curtains", "comforters", "doormats"]);
  assert.deepEqual(HOME_SIZE_ROWS.map((r) => r.slug), ["bedsheets", "curtains", "comforters", "doormats"]);
});

test("bedsheets: the 4 sizes with the most products, most first (live 2026-11-05 data)", () => {
  const [bedsheets] = selectSizeRows(CATEGORIES, SUBS);
  assert.deepEqual(names(bedsheets), ["Double Bed Size", "91 x 98 Inches", "King Size", "93 x 108 Inches"]);
  assert.equal(bedsheets.groupLabel, "Bed Size");
});

test("bedsheets: equal counts fall back to displayOrder, then name (deterministic)", () => {
  const tied = [
    sub("bedsheets", "B size", { productCount: 5, displayOrder: 2 }),
    sub("bedsheets", "A size", { productCount: 5, displayOrder: 2 }),
    sub("bedsheets", "C size", { productCount: 5, displayOrder: 1 }),
    sub("bedsheets", "D size", { productCount: 9, displayOrder: 9 }),
    sub("bedsheets", "E size", { productCount: 1, displayOrder: 0 }),
  ];
  const first = names(selectSizeRows(CATEGORIES, tied)[0]);
  assert.deepEqual(first, ["D size", "C size", "A size", "B size"]);
  // Same input in a different order -> same result.
  assert.deepEqual(names(selectSizeRows(CATEGORIES, [...tied].reverse())[0]), first);
});

test("other rows keep the old order: admin displayOrder, ties in API order", () => {
  const rows = selectSizeRows(CATEGORIES, SUBS);
  assert.deepEqual(names(rows[1]), ["7x4 Ft", "9x4 Ft"]);
  assert.deepEqual(names(rows[2]), ["90 x 50 Inches", "Single Bed Size", "Double Bed Size", "90 x 72 Inches"]);
  assert.equal(rows[3].items.length, 5);
});

test("only size groups count; a missing or size-less category is skipped", () => {
  const rows = selectSizeRows(CATEGORIES.filter((c) => c.slug !== "curtains"), SUBS.filter((s) => s.category._id !== "c-doormats"));
  assert.deepEqual(rows.map((r) => r.category.slug), ["bedsheets", "comforters"]);
  assert.ok(!rows[0].items.some((i) => i.name === "Cotton"));
  assert.deepEqual(selectSizeRows([], []), []);
});

test("Hindi group label is translated, unknown labels pass through", () => {
  assert.equal(groupLabelHi("Size"), "साइज़");
  assert.equal(groupLabelHi("Bed Size"), "बेड साइज़");
  assert.equal(groupLabelHi(" bed size "), "बेड साइज़");
  assert.equal(groupLabelHi("Window Size"), "Window Size");
  assert.equal(groupLabelHi(), "");
});

test("SubcategoryRow: real links, View All, one-card arrows, hidden scrollbar, Hindi label", () => {
  const src = fs.readFileSync(new URL("../src/components/SubcategoryShowcase/SubcategoryRow.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /useNavigate|navigate\(/);
  assert.match(src, /<Link\s+key=\{sub\._id\}\s+to=\{`\$\{prefix\}\/category\/\$\{category\.slug\}\/\$\{sub\.slug\}`\}/);
  assert.match(src, /to=\{`\$\{prefix\}\/category\/\$\{category\.slug\}`\}/);
  assert.match(src, /card\.offsetWidth \+ gap/);
  assert.match(src, /\$\{HIDDEN_SCROLLBAR\} flex gap-5 overflow-x-auto/);
  assert.match(src, /groupLabelHi\(groupLabel\)/);
});
