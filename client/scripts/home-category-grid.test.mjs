// Homepage category grid (src/components/Categories/Categories.jsx): two
// columns on phones (was one full-width card per category, ~4,800px for 13
// categories at 375px); sm and up keep the old layout; skeleton matches.
//   node --test scripts/home-category-grid.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/components/Categories/Categories.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("grid and skeleton: 2 columns on phones, 3 from lg, same gaps", () => {
  const grids = src.match(/className="grid [^"]+"/g);
  assert.deepEqual(grids, [
    'className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8"',
    'className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8"',
  ]);
  assert.doesNotMatch(src, /grid-cols-1/);
});

test("card and skeleton heights match per breakpoint; sm+ sizes unchanged", () => {
  assert.match(src, /<Skeleton key=\{index\} className="h-48 sm:h-72 rounded-2xl" \/>/);
  assert.match(src, /<div className="relative h-48 sm:h-72 overflow-hidden">/);
  assert.match(src, /sizes="\(min-width: 1024px\) 405px, 45vw"/);
  assert.match(src, /className="text-base sm:text-xl font-semibold leading-tight mb-1"/);
  assert.match(src, /className="hidden sm:block text-sm text-white\/80 line-clamp-1"/);
});

test("the h1, intro copy and category text links are unchanged", () => {
  assert.match(src, /<h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">/);
  assert.match(src, /t\("Shop Bedsheets, Comforters & Curtains Online", "बेडशीट, कम्फर्टर और पर्दे ऑनलाइन खरीदें"\)/);
  assert.match(src, /to=\{`\$\{prefix\}\/category\/\$\{c\.slug\}`\}/);
  assert.match(src, /to=\{`\$\{prefix\}\/category\/\$\{category\.slug\}`\}/);
});
