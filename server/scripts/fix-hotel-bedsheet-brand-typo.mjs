// One-off fix (2026-10-09), found by the Merchant Center feed re-check:
// the 5 "Hotel Bedsheet" products (created in the same Round 20 data-fix
// pass as fix-bedsheets-subcategory-gaps.mjs) carry brand: "Mittal
// Collection" (singular) while 81 other own-brand products use the
// canonical "Mittal Collections" (plural) -- a catalog typo, not a feed
// bug (the feed just reflects whatever's in the DB).
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const PRODUCT_IDS = [
  "6a82f86d53c2f308a83db883",
  "6a82f86a53c2f308a83db882",
  "6a82ee635c85240008d728d6",
  "6a82eca25c85240008d727bd",
  "6a82e59e5c85240008d72402",
];

for (const id of PRODUCT_IDS) {
  const product = await getProductAdmin(BASE, id, TOKEN);
  console.log(`${product.name}: current brand = "${product.brand}"`);

  if (product.brand !== "Mittal Collection") {
    console.log("  -> skipping, brand doesn't match expected typo");
    continue;
  }

  const fd = buildProductUpdateFormData(product, { brand: "Mittal Collections" });
  const { status, data } = await updateProduct(BASE, id, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
