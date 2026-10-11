// SEO round (2026-10-11) found the Toys category's 3 subcategories (Tiger/
// Dinosaur/Dolphin Bop Bag) are the ONLY subcategories in the entire
// catalog with an empty `subtitle` field -- every other subcategory (69/69
// checked) has real SEO copy there. Root cause: server/scripts/
// create-toys-subcategories.mjs (round 20) never included `subtitle` in its
// createSubcategory() payload. Copy below describes the real product
// mechanism (sand-filled weighted base, bounces back upright) stated in the
// product's own description, not invented.
import { getSubcategoryAdmin, updateSubcategorySubtitle } from "./lib/adminSubcategoryApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

// No subtitleHi field exists on the Subcategory model -- subtitle is
// English-only sitewide (confirmed against other categories' subtitle
// copy, which is also English-only), so there's nothing to set for Hindi.
const FIXES = [
  {
    id: "6ac79864b1ac2adbc7c044dc",
    name: "Tiger Bop Bag",
    subtitle: "Stripes and all -- a sand-weighted bop bag that pops right back up after every knock, built for active indoor play.",
  },
  {
    id: "6ac79866b1ac2adbc7c044dd",
    name: "Dinosaur Bop Bag",
    subtitle: "A roaring dino character on a sand-filled base that always bounces back upright, no matter how hard it's hit.",
  },
  {
    id: "6ac79869b1ac2adbc7c044de",
    name: "Dolphin Bop Bag",
    subtitle: "A playful dolphin on a sand-weighted base -- knock it down and it pops right back up, every time.",
  },
];

for (const fix of FIXES) {
  const sub = await getSubcategoryAdmin(BASE, fix.id, TOKEN);
  if (sub.name !== fix.name) {
    console.log(`SKIP ${fix.id}: name mismatch (live: "${sub.name}" vs expected "${fix.name}")`);
    continue;
  }
  console.log(`${sub.name}: current subtitle="${sub.subtitle}"`);

  const { status, data } = await updateSubcategorySubtitle(BASE, fix.id, fix.subtitle, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
