// Follow-up fix (2026-10-08), found by the catalog-wide data-integrity
// sweep: the Bedsheets > By Type > "Standard Bedsheet" subcategory had
// zero products tagged (same shape as the Toys/Madrasi gaps found
// earlier today), and the 5 "Hotel Bedsheet" products were tagged with
// the WRONG "Double Bed Size" subcategory doc -- Hotel Linen's
// (6a82faf853c2f308a83dba7f), not Bedsheets' own
// (6a6b420028eda4773dd999c7) -- alongside the correct one, likely a
// copy-paste mistake from a Hotel Linen product template.
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

const STANDARD_BEDSHEET_ID = "6ab0e2a6520803c42433e4f8";
const CORRECT_BEDSHEETS_DOUBLE_BED_SIZE_ID = "6a6b420028eda4773dd999c7";
const NINETYONE_X_98_ID = "6aa28c1137ce8007995d01e5";

const HOTEL_BEDSHEET_IDS = [
  "6a82f86d53c2f308a83db883",
  "6a82f86a53c2f308a83db882",
  "6a82ee635c85240008d728d6",
  "6a82eca25c85240008d727bd",
  "6a82e59e5c85240008d72402",
];

const ADD_ONLY_IDS = [
  "6a7c76b9ecf6b0319837a5c4",
  "6a7c7497ecf6b0319837a583",
];

for (const id of HOTEL_BEDSHEET_IDS) {
  const product = await getProductAdmin(BASE, id, TOKEN);
  console.log(`${product.name}: current =`, (product.subcategories || []).map((s) => s.name || s));

  const fd = buildProductUpdateFormData(product, {
    subcategories: [CORRECT_BEDSHEETS_DOUBLE_BED_SIZE_ID, NINETYONE_X_98_ID, STANDARD_BEDSHEET_ID],
  });
  const { status, data } = await updateProduct(BASE, id, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}

for (const id of ADD_ONLY_IDS) {
  const product = await getProductAdmin(BASE, id, TOKEN);
  console.log(`${product.name}: current =`, (product.subcategories || []).map((s) => s.name || s));

  const fd = buildProductUpdateFormData(product, { addSubcategories: [STANDARD_BEDSHEET_ID] });
  const { status, data } = await updateProduct(BASE, id, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
