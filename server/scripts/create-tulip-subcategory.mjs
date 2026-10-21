// SEO (2026-10-21): GSC showed 13 "tulip comforter" query variants (~200
// impressions, all position 9.6-12.8, zero clicks) because 14 separate
// "Tulip Original" product pages split ranking signal and no single
// brand page exists. Creates one "Tulip" subcategory under Comforters
// (new "By Brand" group) and tags all 14 Tulip products with it.
// Dry-run by default; pass --apply to write.
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
  createSubcategory,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const COMFORTERS_CATEGORY_ID = "6abcb82e598c3c49f7f067ba";
const APPLY = process.argv.includes("--apply");

const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const SUBCATEGORY = {
  groupLabel: "By Brand",
  name: "Tulip",
  nameHi: "ट्यूलिप",
  subtitle:
    "Tulip Original reversible microfibre comforters in Single (90x50 inches) and Double (90x72 inches) bed sizes - soft, lightweight, two designs in one. Delivered across India.",
  subtitleHi:
    "ट्यूलिप ओरिजिनल रिवर्सिबल माइक्रोफाइबर कम्फर्टर - सिंगल (90x50 इंच) और डबल (90x72 इंच) बेड साइज़ में। नरम, हल्के और एक में दो डिज़ाइन। पूरे भारत में डिलीवरी।",
};

const list = await (await fetch(`${BASE}/products?category=${COMFORTERS_CATEGORY_ID}&limit=100`)).json();
const tulip = (list.products || list.data || []).filter((p) => /^tulip original/i.test(p.name));
console.log(`Found ${tulip.length} Tulip products (expected 14)`);
if (tulip.length !== 14) {
  console.error("Unexpected count, aborting.");
  process.exit(1);
}

const existing = await (await fetch(`${BASE}/subcategories`)).json();
const dup = (existing.subcategories || existing.data || []).find(
  (s) => (s.category?._id || s.category) === COMFORTERS_CATEGORY_ID && s.name === SUBCATEGORY.name,
);
if (dup) {
  console.error(`Subcategory "Tulip" already exists (${dup._id}), aborting to avoid a duplicate.`);
  process.exit(1);
}

if (!APPLY) {
  console.log("DRY RUN. Would create:", JSON.stringify(SUBCATEGORY, null, 2));
  tulip.forEach((p) => console.log("  would tag:", p._id, p.name));
  process.exit(0);
}

const subcategoryId = await createSubcategory(BASE, TOKEN, {
  category: COMFORTERS_CATEGORY_ID,
  ...SUBCATEGORY,
  imageUrl: tulip[0].image,
});
console.log(`created subcategory "Tulip" -> ${subcategoryId}`);

for (const p of tulip) {
  const product = await getProductAdmin(BASE, p._id, TOKEN);
  const fd = buildProductUpdateFormData(product, { addSubcategories: [subcategoryId] });
  const { status, data } = await updateProduct(BASE, p._id, fd, TOKEN);
  console.log(`  ${p._id} -> PUT ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
