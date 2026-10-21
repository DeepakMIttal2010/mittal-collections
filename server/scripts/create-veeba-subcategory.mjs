// Follow-up to create-tulip-subcategory.mjs (2026-10-21): a subcategory
// that is the sole member of its group canonicalizes to the parent
// category (see client/api/sitemap.js), which made the new "Tulip" page
// fold into /category/comforters. The other 3 comforters are brand
// Veeba, so a "Veeba" subcategory gives the "By Brand" group its second
// member and lets both pages be self-canonical and sitemap-listed.
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
  createSubcategory,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const COMFORTERS_CATEGORY_ID = "6abcb82e598c3c49f7f067ba";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const list = await (await fetch(`${BASE}/products?category=${COMFORTERS_CATEGORY_ID}&limit=100`)).json();
const veeba = (list.products || list.data || []).filter((p) => /^veeba/i.test(p.name));
if (veeba.length !== 3) {
  console.error(`Expected 3 Veeba products, found ${veeba.length}. Aborting.`);
  process.exit(1);
}

const subcategoryId = await createSubcategory(BASE, TOKEN, {
  category: COMFORTERS_CATEGORY_ID,
  groupLabel: "By Brand",
  name: "Veeba",
  nameHi: "वीबा",
  subtitle:
    "Veeba White Lilly reversible microfibre comforters in Double Bed size (90x72 inches) - soft, lightweight, two designs in one. Delivered across India.",
  subtitleHi:
    "वीबा व्हाइट लिली रिवर्सिबल माइक्रोफाइबर कम्फर्टर - डबल बेड साइज़ (90x72 इंच) में। नरम, हल्के और एक में दो डिज़ाइन। पूरे भारत में डिलीवरी।",
  imageUrl: veeba[0].image,
});
console.log(`created subcategory "Veeba" -> ${subcategoryId}`);

for (const p of veeba) {
  const product = await getProductAdmin(BASE, p._id, TOKEN);
  const fd = buildProductUpdateFormData(product, { addSubcategories: [subcategoryId] });
  const { status, data } = await updateProduct(BASE, p._id, fd, TOKEN);
  console.log(`  ${p._id} -> PUT ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
