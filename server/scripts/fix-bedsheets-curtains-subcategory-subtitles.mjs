// Deep SEO round (2026-10-19) found 4 subcategories with an empty
// `subtitle` field, inheriting their parent category's description
// verbatim as their meta description (CategoryPage.jsx's fallback,
// line ~807) -- the only 4 out of 79 subcategories missing one, every
// sibling in the same group already has real, distinct copy (see
// "70-x-90-inches" vs its siblings "91-x-98-inches"/"93-x-108-inches",
// and "velvet" vs its sibling "satin", for the style this mirrors).
import { getSubcategoryAdmin, updateSubcategorySubtitle } from "./lib/adminSubcategoryApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

// No subtitleHi field exists on the Subcategory model -- subtitle is
// English-only sitewide, nothing to set for Hindi.
const FIXES = [
  {
    id: "6acde78b8e141a33266e9c05",
    name: "70 x 90 Inches",
    subtitle:
      "A 70x90 inch single bedsheet sized for standard Indian single beds, with enough overhang on all sides to tuck in comfortably.",
  },
  {
    id: "6acde8fa8e141a33266e9cf2",
    name: "72 x 100 Inches",
    subtitle:
      "A 72x100 inch bedsheet with a bit more length and width than the standard 70x90 inch size -- extra room for a taller bed or a thicker mattress.",
  },
  {
    id: "6acde9288e141a33266e9d14",
    name: "Diwan Bed Size",
    subtitle:
      "Bedsheets sized for diwan beds -- the wider, lower seating-cum-bed furniture common in Indian living rooms, cut to fit without excess overhang.",
  },
  {
    id: "6acce026b89d4f8c604da125",
    name: "Velvet",
    subtitle:
      "Velvet curtains with a dense, light-blocking pile that adds warmth and texture to a room -- heavier and more insulating than satin or cotton curtains.",
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
