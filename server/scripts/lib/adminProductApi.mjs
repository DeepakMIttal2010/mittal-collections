// Shared helpers for one-off admin scripts that read/update products
// through the live API (see server/controllers/productController.js'
// updateProduct — a full-document overwrite, not a partial patch).
//
// This file exists because hand-rolling the update FormData in a fresh
// script each time is exactly how a product's cover photo got silently
// reset on production THREE separate times (2026-08-18, 2026-08-19,
// 2026-09-04 — see the memory file main_image_reset_bug_2026-08-18.md
// in this project's AI assistant memory, if you have access to it).
// Every prior incident was a script whose FormData builder sent a
// hardcoded `mainImageIndex: "0"` instead of preserving whatever the
// admin had actually chosen as the cover.
//
// buildProductUpdateFormData() below makes that specific mistake
// structurally impossible: there is no raw `mainImageIndex` parameter
// in its API at all. The current cover is preserved automatically
// (`images.indexOf(image)`) unless the caller explicitly passes
// `newCoverUrl`, which must be a URL already present in the product's
// image list (or one just added via `newImages`/`existingImages`
// overrides) — i.e. changing the cover requires stating that intent by
// name, not by accidentally supplying the right (or wrong) index.
//
// Usage:
//   import {
//     login,
//     getProductAdmin,
//     buildProductUpdateFormData,
//     updateProduct,
//   } from "./lib/adminProductApi.mjs";
//
//   const BASE = "https://mittal-collections-api.onrender.com/api";
//   const token = await login(BASE, email, password);
//   const product = await getProductAdmin(BASE, id, token);
//   const fd = buildProductUpdateFormData(product, {
//     colorVariesNote: "...",
//     addSubcategories: [someSubcategoryId], // merges, doesn't replace
//   });
//   const { status, data } = await updateProduct(BASE, id, fd, token);

const RETRYABLE_DELAY_MS = 5000;
const MAX_RETRIES = 5;

async function withRetries(fn, label) {
  let lastErr;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.log(`${label} attempt ${i + 1} error:`, e.message);
      await new Promise((r) => setTimeout(r, RETRYABLE_DELAY_MS));
    }
  }
  throw lastErr ?? new Error(`${label} failed after ${MAX_RETRIES} retries`);
}

export async function login(base, email, password) {
  return withRetries(async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
    return data.token;
  }, "login");
}

export async function getProductAdmin(base, id, token) {
  return withRetries(async () => {
    const res = await fetch(`${base}/products/${id}/admin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(`Fetch failed for ${id}: ` + JSON.stringify(data));
    return data.product;
  }, `getProductAdmin(${id})`);
}

// Every field updateProduct's full-overwrite endpoint reads from
// req.body, defaulted from the product's current value unless an
// override is given. `mainImageIndex` is deliberately NOT a passthrough
// override — see file header. Passing it directly throws, so a caller
// can't reintroduce the footgun this file exists to remove.
export function buildProductUpdateFormData(product, overrides = {}) {
  if ("mainImageIndex" in overrides) {
    throw new Error(
      "buildProductUpdateFormData: don't pass mainImageIndex directly — " +
        "use `newCoverUrl` (a URL already in the final image list) if you " +
        "actually intend to change the cover photo. This guard exists " +
        "because a hardcoded mainImageIndex is what reset product covers " +
        "on production three times; see main_image_reset_bug_2026-08-18.md.",
    );
  }

  const get = (key, fallback) =>
    Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : fallback;

  const existingSubcategoryIds = (product.subcategories || []).map((s) => s._id || s);
  const subcategories = Object.prototype.hasOwnProperty.call(overrides, "subcategories")
    ? overrides.subcategories
    : Object.prototype.hasOwnProperty.call(overrides, "addSubcategories")
      ? [...new Set([...existingSubcategoryIds, ...overrides.addSubcategories])]
      : existingSubcategoryIds;

  const images = get("existingImages", product.images || []);
  const videos = get("existingVideos", product.videos || []);

  const newCoverUrl = overrides.newCoverUrl;
  const mainIndex = newCoverUrl
    ? Math.max(images.indexOf(newCoverUrl), 0)
    : Math.max(images.indexOf(product.image), 0);

  if (newCoverUrl && !images.includes(newCoverUrl)) {
    throw new Error(
      `buildProductUpdateFormData: newCoverUrl "${newCoverUrl}" is not in the ` +
        "final image list (existingImages override, if any, plus product.images) " +
        "— add it there first (e.g. via existingImages) or it can never become the cover.",
    );
  }

  const fd = new FormData();
  fd.append("name", get("name", product.name));
  fd.append("nameHi", get("nameHi", product.nameHi || ""));
  fd.append("description", get("description", product.description || ""));
  fd.append("descriptionHi", get("descriptionHi", product.descriptionHi || ""));
  fd.append("category", get("category", product.category?._id || product.category));
  fd.append("subcategories", JSON.stringify(subcategories));
  fd.append("price", get("price", product.price));
  fd.append("oldPrice", get("oldPrice", product.oldPrice));
  fd.append("purchasePrice", get("purchasePrice", product.purchasePrice || 0));
  fd.append("miscExpenses", get("miscExpenses", product.miscExpenses || 0));
  fd.append("stock", get("stock", product.stock));
  fd.append("size", get("size", product.size || ""));
  fd.append("fabric", get("fabric", product.fabric || ""));
  fd.append("gsm", get("gsm", product.gsm || ""));
  fd.append("washCare", get("washCare", product.washCare || ""));
  fd.append("brand", get("brand", product.brand || ""));
  fd.append("countryOfOrigin", get("countryOfOrigin", product.countryOfOrigin || ""));
  fd.append("whatsIncluded", get("whatsIncluded", product.whatsIncluded || ""));
  fd.append("colorVariesNote", get("colorVariesNote", product.colorVariesNote || ""));
  fd.append("featured", String(!!get("featured", product.featured)));
  fd.append("isActive", String(!!get("isActive", product.isActive)));
  fd.append("isTrending", String(!!get("isTrending", product.isTrending)));
  fd.append("trendingRank", get("trendingRank", product.trendingRank || 0));
  fd.append(
    "showInNewArrivals",
    String(get("showInNewArrivals", product.showInNewArrivals !== false)),
  );
  fd.append("willRestock", String(!!get("willRestock", product.willRestock)));
  fd.append("visibility", get("visibility", product.visibility || "both"));
  fd.append("isReturnable", String(!!get("isReturnable", product.isReturnable)));
  fd.append("returnPeriodDays", get("returnPeriodDays", product.returnPeriodDays || 0));
  fd.append(
    "restockAlertEnabled",
    String(!!get("restockAlertEnabled", product.restockAlertEnabled)),
  );
  fd.append(
    "restockAlertQuantity",
    get("restockAlertQuantity", product.restockAlertQuantity || 0),
  );
  fd.append("mainImageIndex", String(mainIndex));
  fd.append("existingImages", JSON.stringify(images));
  fd.append("existingVideos", JSON.stringify(videos));

  const variants = get("variants", product.variants);
  if (variants && variants.length) {
    fd.append("variants", JSON.stringify(variants));
  }

  return fd;
}

export async function updateProduct(base, id, formData, token) {
  return withRetries(async () => {
    const res = await fetch(`${base}/products/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  }, `updateProduct(${id})`);
}

export async function fetchImageBlob(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "image/jpeg" });
}

export async function createSubcategory(base, token, { category, groupLabel, name, nameHi, imageUrl, isActive = true }) {
  const fd = new FormData();
  fd.append("category", category);
  fd.append("groupLabel", groupLabel);
  fd.append("name", name);
  if (nameHi) fd.append("nameHi", nameHi);
  fd.append("isActive", String(isActive));
  if (imageUrl) fd.append("image", await fetchImageBlob(imageUrl), "thumb.jpg");

  return withRetries(async () => {
    const res = await fetch(`${base}/subcategories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) throw new Error(`Subcategory create failed (${name}): ` + JSON.stringify(data));
    return data.subcategory._id;
  }, `createSubcategory(${name})`);
}
