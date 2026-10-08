// Follow-up fix (2026-10-08) after fix-madrasi-subcategory.mjs: user
// pointed out two more Towels subcategory gaps:
//   1. Madrasi towels are also bath towels -- should additionally carry
//      the Bath Towel tag, not just Madrasi Towel.
//   2. Cleaning Gloves / Microfiber Cleaning Towel subcategories had
//      zero products tagged, even though matching products exist.
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;

const BATH_TOWEL_ID = "6a9fe1ae79896b2a3e14dbec";
const CLEANING_GLOVES_ID = "6a9fe1af79896b2a3e14dbed";
const MICROFIBER_CLEANING_TOWEL_ID = "6a858ecb67407e1e8c6344be";

const UPDATES = [
  // Madrasi towels: also tag as Bath Towel.
  { id: "6a85914667407e1e8c6345d4", add: [BATH_TOWEL_ID] }, // Big Shaktiman
  { id: "6a858bef67407e1e8c6343d8", add: [BATH_TOWEL_ID] }, // Amar Fabrix
  { id: "6a858b4d67407e1e8c6343cf", add: [BATH_TOWEL_ID] }, // Five Star
  { id: "6a8583a5c31d4f8d51d40e2b", add: [BATH_TOWEL_ID] }, // Pink Checkered
  // Untagged products -> their matching subcategory.
  { id: "6a9fe1c479896b2a3e14dbf0", add: [CLEANING_GLOVES_ID] }, // SANVI Microfiber Cleaning Glove
  { id: "6a858f0667407e1e8c6344e8", add: [MICROFIBER_CLEANING_TOWEL_ID] }, // Microfiber Cleaning Towel 12x16
];

if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

for (const { id, add } of UPDATES) {
  const product = await getProductAdmin(BASE, id, TOKEN);
  console.log(`${product.name}: current subcategories =`, (product.subcategories || []).map((s) => s.name || s));

  const fd = buildProductUpdateFormData(product, { addSubcategories: add });
  const { status, data } = await updateProduct(BASE, id, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
