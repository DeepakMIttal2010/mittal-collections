// PR-9b1: what an admin update actually changed, for the audit log.
//
// diffForAudit(before, after, spec) compares two plain snapshots of a
// record (taken right before and right after the save) and returns
// { changes, truncated }. Only fields named in the spec are looked at --
// the allowlist is the only way a value gets in. Per spec list:
//   values      old -> new           { field, from, to }
//   changeOnly  long text            { field, changed, fromLength, toLength }
//   flags       e.g. an image URL    { field, changed }
//   counts      images / videos      { field, fromCount, toCount[, mainImageChanged] }
//   variants    per size             { field: "variants[King].stock", from, to }
//                                    { field: "variants[Queen]", added } / { ..., removed }
// On top of the allowlist, any field whose name looks like a credential
// (password, token, secret, otp, key) is reduced to { field, changed }.
// Caps (owner decisions D5/D6): 200 characters per value, 50 sizes,
// 60 changes per entry -- anything beyond is dropped and truncated=true.

const MAX_VALUE_LENGTH = 200;
const MAX_CHANGES = 60;
const MAX_SIZES = 50;
const MAX_SIZE_LABEL = 50;
const DENYLIST = /password|token|secret|otp|key/i;

const isObjectId = (value) => value?._bsontype === "ObjectId" || value?._bsontype === "ObjectID";

// Plain, comparable form: ids and dates as strings, undefined as null.
const normalize = (value) => {
  if (value === undefined || value === null) return null;
  if (isObjectId(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
};

const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

const capValue = (value) => {
  if (typeof value === "string") return value.slice(0, MAX_VALUE_LENGTH);
  if (Array.isArray(value)) {
    const json = JSON.stringify(value);
    return json.length <= MAX_VALUE_LENGTH ? value : json.slice(0, MAX_VALUE_LENGTH);
  }
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, MAX_VALUE_LENGTH);
  return value;
};

const textLength = (value) => (value === undefined || value === null ? 0 : String(value).length);
const asList = (value) => (Array.isArray(value) ? value : []);

const valueChange = (field, from, to) =>
  DENYLIST.test(field)
    ? { field, changed: true }
    : { field, from: capValue(normalize(from)), to: capValue(normalize(to)) };

const variantChanges = (before, after, { key, fields }) => {
  const label = (row) => String(row?.[key] ?? "").slice(0, MAX_SIZE_LABEL);
  const oldRows = new Map(asList(before).map((row) => [label(row), row]));
  const newRows = new Map(asList(after).map((row) => [label(row), row]));
  const labels = [...new Set([...oldRows.keys(), ...newRows.keys()])];

  const changes = [];
  let sizes = 0;
  let truncated = false;
  for (const size of labels) {
    const oldRow = oldRows.get(size);
    const newRow = newRows.get(size);
    let rowChanges;
    if (!oldRow) rowChanges = [{ field: `variants[${size}]`, added: true }];
    else if (!newRow) rowChanges = [{ field: `variants[${size}]`, removed: true }];
    else {
      rowChanges = fields
        .filter((name) => !same(oldRow[name], newRow[name]))
        .map((name) => valueChange(`variants[${size}].${name}`, oldRow[name], newRow[name]));
    }
    if (!rowChanges.length) continue;
    if (sizes >= MAX_SIZES) {
      truncated = true;
      break;
    }
    sizes += 1;
    changes.push(...rowChanges);
  }
  return { changes, truncated };
};

export const diffForAudit = (before = {}, after = {}, spec = {}) => {
  const changes = [];
  let truncated = false;

  for (const field of spec.values || []) {
    if (!same(before[field], after[field])) changes.push(valueChange(field, before[field], after[field]));
  }
  for (const field of spec.changeOnly || []) {
    if (same(before[field], after[field])) continue;
    changes.push(
      DENYLIST.test(field)
        ? { field, changed: true }
        : { field, changed: true, fromLength: textLength(before[field]), toLength: textLength(after[field]) },
    );
  }
  for (const field of spec.flags || []) {
    if (!same(before[field], after[field])) changes.push({ field, changed: true });
  }
  for (const [field, options] of Object.entries(spec.counts || {})) {
    const main = options?.main;
    const listChanged = !same(before[field], after[field]);
    const mainChanged = main ? !same(before[main], after[main]) : false;
    if (!listChanged && !mainChanged) continue;
    changes.push({
      field,
      fromCount: asList(before[field]).length,
      toCount: asList(after[field]).length,
      ...(main && { mainImageChanged: mainChanged }),
    });
  }
  if (spec.variants) {
    const result = variantChanges(before.variants, after.variants, spec.variants);
    changes.push(...result.changes);
    truncated = result.truncated;
  }

  if (changes.length > MAX_CHANGES) {
    changes.length = MAX_CHANGES;
    truncated = true;
  }
  return { changes, truncated };
};

// Plain snapshot of a Mongoose document (or an already-plain object), read
// the way a fresh load would see it: schema defaults filled in. Otherwise a
// field left unset by a save (undefined in memory) would look like a change
// from its default -- e.g. oldPrice 0 -> null -- although nothing changed.
export const auditSnapshot = (doc) => {
  if (!doc || typeof doc.toObject !== "function") return { ...(doc || {}) };
  const options = { depopulate: true, getters: false, virtuals: false };
  const plain = doc.toObject(options);
  const Model = doc.constructor;
  return typeof Model?.hydrate === "function" ? Model.hydrate(plain).toObject(options) : plain;
};

// Hands the diff to the audit middleware (middleware/adminAuditLog.js),
// which stores it only if the response turns out successful.
export const recordAuditChanges = (res, before, after, spec) => {
  res.locals.auditChanges = diffForAudit(auditSnapshot(before), auditSnapshot(after), spec);
};

// Allowlists (owner decisions D1-D5, 2026-11-27). A field not listed here
// is never recorded with a value.
export const AUDIT_SPECS = {
  product: {
    values: [
      "name", "nameHi", "price", "oldPrice", "mrpVerified", "stock", "category", "subcategories",
      "additionalCategories", "featured", "isActive", "visibility", "isTrending", "trendingRank",
      "showInNewArrivals", "isGiftingItem", "willRestock", "isReturnable", "returnPeriodDays",
      "localDeliveryOnly", "restockAlertEnabled", "restockAlertQuantity", "fabric", "fabricHi", "color",
      "pattern", "size", "gsm", "gsmHi", "brand", "brandHi", "countryOfOrigin", "countryOfOriginHi",
      // Cost fields (D2): the audit log is readable by the Full Admin only.
      "purchasePrice", "miscExpenses", "purchaseDate",
    ],
    changeOnly: [
      "description", "descriptionHi", "whatsIncluded", "colorVariesNote", "colorVariesNoteHi",
      "washCare", "washCareHi", "adminRemarks",
    ],
    counts: { images: { main: "image" }, videos: {} },
    variants: { key: "size", fields: ["price", "oldPrice", "stock"] },
  },
  // PATCH /api/products/:id/trending touches only these two.
  productTrending: {
    values: ["isTrending", "trendingRank"],
  },
  category: {
    values: ["name", "nameHi", "featured", "isPinned", "displayOrder", "isActive", "seoTitle", "seoTitleHi"],
    changeOnly: ["description", "descriptionHi", "seoDescription", "seoDescriptionHi", "aboutText", "aboutTextHi"],
    flags: ["image", "banner"],
  },
  subcategory: {
    values: ["name", "nameHi", "category", "groupLabel", "displayOrder", "isActive", "seoTitle", "seoTitleHi"],
    changeOnly: ["subtitle", "subtitleHi", "seoDescription", "seoDescriptionHi", "aboutText", "aboutTextHi"],
    flags: ["image"],
  },
  coupon: {
    values: ["code", "discountType", "discountValue", "maxDiscount", "firstOrderOnly", "showAsBanner", "isActive"],
    changeOnly: ["description"],
  },
};
