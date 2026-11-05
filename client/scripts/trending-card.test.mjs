// Homepage Top Trending card helpers -- src/utils/trendingCard.js.
//   node --test scripts/trending-card.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { splitVariantName } from "../src/utils/trendingCard.js";

test("variant split: colour/design after the last ' - '", () => {
  assert.deepEqual(splitVariantName("Central Table Cover 40x60 Inches - Blue Check"), {
    base: "Central Table Cover 40x60 Inches",
    variant: "Blue Check",
  });
  assert.deepEqual(
    splitVariantName(
      "Dev D'Decor Double Bedsheet 230x245 cm with 2 Pillow Covers - Maroon Diamond Patchwork Floral (Book-Style Gift Box) ",
    ),
    {
      base: "Dev D'Decor Double Bedsheet 230x245 cm with 2 Pillow Covers",
      variant: "Maroon Diamond Patchwork Floral (Book-Style Gift Box)",
    },
  );
  assert.deepEqual(splitVariantName("सेंट्रल टेबल कवर 40x60 इंच - ब्लू चेक"), {
    base: "सेंट्रल टेबल कवर 40x60 इंच",
    variant: "ब्लू चेक",
  });
  // Hyphenated words are not separators.
  assert.deepEqual(splitVariantName("River Stones Print Anti-Slip Doormat 15x22 Inches"), {
    base: "River Stones Print Anti-Slip Doormat 15x22 Inches",
    variant: "",
  });
});

test("variant split: empty or edge input keeps the whole name", () => {
  assert.deepEqual(splitVariantName(""), { base: "", variant: "" });
  assert.deepEqual(splitVariantName(undefined), { base: "", variant: "" });
  assert.deepEqual(splitVariantName("Towel - "), { base: "Towel -", variant: "" });
  assert.deepEqual(splitVariantName(" - Blue"), { base: "- Blue", variant: "" });
});

test("TrendingSection: rank badge only for real ranks, price via verifiedMrp, no updated time", () => {
  const src = fs.readFileSync(
    new URL("../src/components/TrendingSection/TrendingSection.jsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /product\.trendingRank > 0 &&/);
  assert.doesNotMatch(src, /index \+ 1/);
  assert.match(src, /verifiedMrp\(product\)/);
  assert.doesNotMatch(src, /oldPrice/);
  assert.doesNotMatch(src, /lastUpdated|trendingUpdatedLabel|t\("Updated"|अपडेट किया गया/);
  // Both scroll rows (cards + loading skeleton) hide only the bar.
  assert.equal(src.match(/\$\{HIDDEN_SCROLLBAR\} flex gap-6 overflow-x-auto/g)?.length, 2);
});
