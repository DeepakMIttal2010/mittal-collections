// One-off fix: 3 Madrasi towel products have an empty `subcategories`
// array, so they don't show up under /category/towels/madrasi-towel
// even though they're correctly in the Towels category. Root cause
// confirmed via read-only investigation (2026-10-08).
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
const MADRASI_SUBCATEGORY_ID = "6a85834ec31d4f8d51d40cf2";

const PRODUCT_IDS = [
  "6a858bef67407e1e8c6343d8", // Amar Fabrix Checkered Madrasi Cotton Towel
  "6a858b4d67407e1e8c6343cf", // Five Star Checkered Madrasi Cotton Towel
  "6a85914667407e1e8c6345d4", // Big Shaktiman Checkered Madrasi Cotton Towel
];

if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

for (const id of PRODUCT_IDS) {
  const product = await getProductAdmin(BASE, id, TOKEN);
  console.log(`${product.name}: current subcategories =`, product.subcategories);

  const fd = buildProductUpdateFormData(product, {
    addSubcategories: [MADRASI_SUBCATEGORY_ID],
  });
  const { status, data } = await updateProduct(BASE, id, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
