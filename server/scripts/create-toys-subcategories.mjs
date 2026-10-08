// One-off fix (2026-10-08): the Toys category had zero subcategories
// defined, so its 3 Intex "Hit Me" inflatable bop-bag products had no
// subcategory facet at all (not a mis-tagging bug like the Towels one --
// nothing existed to tag them with). Creates one subcategory per design
// and tags the matching product.
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
  createSubcategory,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOYS_CATEGORY_ID = "6a9fa8a13bf2114da8690c49";

const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const ITEMS = [
  {
    productId: "6a9fa8b93bf2114da8690c4c",
    name: "Tiger Bop Bag",
    nameHi: "टाइगर बॉप बैग",
  },
  {
    productId: "6a9fa8b13bf2114da8690c4b",
    name: "Dinosaur Bop Bag",
    nameHi: "डायनासोर बॉप बैग",
  },
  {
    productId: "6a9fa8aa3bf2114da8690c4a",
    name: "Dolphin Bop Bag",
    nameHi: "डॉल्फिन बॉप बैग",
  },
];

for (const item of ITEMS) {
  const product = await getProductAdmin(BASE, item.productId, TOKEN);
  console.log(`${product.name}: current subcategories =`, (product.subcategories || []).map((s) => s.name || s));

  const subcategoryId = await createSubcategory(BASE, TOKEN, {
    category: TOYS_CATEGORY_ID,
    groupLabel: "By Design",
    name: item.name,
    nameHi: item.nameHi,
    imageUrl: product.image,
  });
  console.log(`  created subcategory "${item.name}" -> ${subcategoryId}`);

  const fd = buildProductUpdateFormData(product, { addSubcategories: [subcategoryId] });
  const { status, data } = await updateProduct(BASE, item.productId, fd, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
