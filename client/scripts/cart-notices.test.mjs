// Cart/checkout audit 2026-11-25.
// CK-01: the cart promised loyalty points on the pre-discount subtotal
// (75 on a 1505 cart with a 75 bundle discount) while checkout and the
// server award them on merchandise after discounts (71).
// CK-03: a non-returnable product (e.g. doormats) was flagged only on the
// product page, never in the cart or at checkout.
//   node --test scripts/cart-notices.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  NON_RETURNABLE_LABEL,
  cartPointsPreview,
  nonReturnableItems,
  nonReturnableSummary,
} from "../src/utils/cartNotices.js";

test("CK-01: cart points use the subtotal after the bundle discount (same as checkout/server)", () => {
  assert.equal(cartPointsPreview({ subtotal: 1505, bundleDiscount: 75, earnRate: 20 }), 71);
  assert.equal(cartPointsPreview({ subtotal: 230, bundleDiscount: 0, earnRate: 20 }), 11);
});

test("CK-01: no earn rate, or discounts above the subtotal, give 0 points", () => {
  assert.equal(cartPointsPreview({ subtotal: 1505, bundleDiscount: 75, earnRate: null }), 0);
  assert.equal(cartPointsPreview({ subtotal: 1505, bundleDiscount: 75, earnRate: 0 }), 0);
  assert.equal(cartPointsPreview({ subtotal: 100, bundleDiscount: 150, earnRate: 20 }), 0);
});

const doormat = { _id: "d1", name: "Rust Orange Cotton Large Doormat", nameHi: "रस्ट ऑरेंज कॉटन डोरमैट", isReturnable: false };
const doormat2 = { _id: "d2", name: "Navy Cotton Large Doormat", isReturnable: false };
const bedsheet = { _id: "b1", name: "Gulmohar Flannel Bedsheet", isReturnable: true };
const oldCartLine = { _id: "o1", name: "Line saved before the field existed" }; // no isReturnable

test("CK-03: only items explicitly marked non-returnable are flagged", () => {
  assert.deepEqual(nonReturnableItems([doormat, bedsheet, oldCartLine]).map((i) => i._id), ["d1"]);
  assert.deepEqual(nonReturnableItems(undefined), []);
});

test("CK-03: the cart label matches the product page badge", () => {
  assert.deepEqual(NON_RETURNABLE_LABEL, { en: "Non-returnable", hi: "गैर-वापसी योग्य" });
});

test("CK-03: checkout summary — singular, plural, Hindi, and none", () => {
  assert.deepEqual(nonReturnableSummary([doormat, bedsheet], "en"), {
    lead: "1 item in this order is non-returnable:",
    names: "Rust Orange Cotton Large Doormat",
  });
  assert.deepEqual(nonReturnableSummary([doormat, doormat2, bedsheet], "en"), {
    lead: "2 items in this order are non-returnable:",
    names: "Rust Orange Cotton Large Doormat, Navy Cotton Large Doormat",
  });
  assert.deepEqual(nonReturnableSummary([doormat], "hi"), {
    lead: "इस ऑर्डर में 1 प्रोडक्ट गैर-वापसी योग्य है:",
    names: "रस्ट ऑरेंज कॉटन डोरमैट",
  });
  assert.deepEqual(nonReturnableSummary([doormat, doormat2], "hi"), {
    lead: "इस ऑर्डर में 2 प्रोडक्ट गैर-वापसी योग्य हैं:",
    names: "रस्ट ऑरेंज कॉटन डोरमैट, Navy Cotton Large Doormat",
  });
  assert.equal(nonReturnableSummary([bedsheet, oldCartLine], "en"), null);
});
