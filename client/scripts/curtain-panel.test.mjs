// CX-01 (curtains audit 2026-11-17): "1 Curtain Panel" clarity on the
// product card, next to the product-page price and in the mobile sticky bar.
// Helper: src/utils/curtainPanel.js.
//   node --test scripts/curtain-panel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  curtainPanelTexts,
  isSingleCurtainPanel,
  panelWidthFt,
} from "../src/utils/curtainPanel.js";

const curtain = {
  whatsIncluded: "1 Curtain Panel",
  size: "7x4 & 9x4 Ft",
  variants: [
    { size: "7x4", price: 404, stock: 10 },
    { size: "9x4", price: 489, stock: 10 },
  ],
};

test("detection: only whatsIncluded '1 Curtain Panel' (case/space-insensitive)", () => {
  assert.equal(isSingleCurtainPanel(curtain), true);
  assert.equal(isSingleCurtainPanel({ whatsIncluded: "  1 curtain   PANEL " }), true);
  for (const p of [
    { whatsIncluded: "1 Bed Sheet + 2 Pillow Covers" },
    { whatsIncluded: "2 Curtain Panels" },
    { whatsIncluded: "" },
    {},
    null,
    undefined,
  ]) {
    assert.equal(isSingleCurtainPanel(p), false);
    assert.equal(curtainPanelTexts(p, "7x4", false), null);
    assert.equal(curtainPanelTexts(p, "7x4", true), null);
  }
});

test("approved wording, English", () => {
  assert.deepEqual(curtainPanelTexts(curtain, "7x4", false), {
    label: "1 Curtain Panel",
    perPanel: "/ panel",
    explainer: "Price is for one panel (4 ft wide). Need a pair for your window? Set quantity to 2.",
    stickyLine: "1 Curtain Panel · 7x4 ft",
  });
});

test("approved wording, Hindi", () => {
  assert.deepEqual(curtainPanelTexts(curtain, "7x4", true), {
    label: "1 पर्दा (सिंगल पैनल)",
    perPanel: "/ पैनल",
    explainer: "कीमत एक पैनल की है (4 फ़ीट चौड़ा)। खिड़की के लिए जोड़ी चाहिए? मात्रा 2 रखें।",
    stickyLine: "1 पर्दा (सिंगल पैनल) · 7x4 ft",
  });
});

test("size switch 7x4 -> 9x4 -> 7x4 keeps label, explainer and sticky line in step", () => {
  for (const hi of [false, true]) {
    const a = curtainPanelTexts(curtain, "7x4", hi);
    const b = curtainPanelTexts(curtain, "9x4", hi);
    const c = curtainPanelTexts(curtain, "7x4", hi);
    assert.deepEqual(c, a, "back to 7x4 gives exactly the first texts");
    assert.equal(b.label, a.label, "single-panel label is the same for both sizes");
    assert.equal(b.perPanel, a.perPanel);
    assert.equal(b.explainer, a.explainer, "both sizes are 4 ft wide");
    assert.match(a.stickyLine, /· 7x4 ft$/);
    assert.match(b.stickyLine, /· 9x4 ft$/);
  }
});

test("width comes from the size, never guessed", () => {
  assert.equal(panelWidthFt("7x4"), 4);
  assert.equal(panelWidthFt("9 x 4 Ft"), 4);
  assert.equal(panelWidthFt("7x5"), 5);
  assert.equal(panelWidthFt("7x4 & 9x4 Ft"), null);
  assert.equal(panelWidthFt(""), null);
  assert.equal(panelWidthFt(undefined), null);
  // No parsable size: the explainer drops the width instead of inventing one.
  const t = curtainPanelTexts(curtain, "7x4 & 9x4 Ft", false);
  assert.equal(t.explainer, "Price is for one panel. Need a pair for your window? Set quantity to 2.");
  assert.equal(curtainPanelTexts(curtain, null, false).stickyLine, "1 Curtain Panel");
  // A size that already says ft is not doubled.
  assert.equal(curtainPanelTexts(curtain, "7x4 Ft", false).stickyLine, "1 Curtain Panel · 7x4 Ft");
});

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("ProductCard: chip + per-panel suffix from the helper, card price unchanged", () => {
  const src = read("../src/components/ProductCard/ProductCard.jsx");
  assert.match(src, /curtainPanelTexts\(product, null, language === "hi"\)/);
  assert.match(src, /className="panel-chip">\{panel\.label\}/);
  assert.match(src, /₹\{product\.price\}\s*\{panel && <span className="per-panel"> \{panel\.perPanel\}<\/span>\}/);
  // Card Add to Cart still sends variant products to the product page.
  assert.match(src, /product\.variants\?\.length > 0[\s\S]{0,400}navigate\(productUrl\(product, isHindi\)\)/);
});

test("ProductDetails: one panel object keyed to the selected size feeds price, note, sticky bar and spec row", () => {
  const src = read("../src/pages/ProductDetails.jsx");
  assert.equal(src.match(/curtainPanelTexts\(/g)?.length, 1, "computed once");
  assert.match(src, /curtainPanelTexts\(\s*product,\s*hasVariants \? selectedVariant\?\.size : product\.size,\s*language === "hi",?\s*\)/);
  assert.match(src, /₹\{displayPrice\}\s*\{panel && \(\s*<span[^>]*>\{panel\.perPanel\}<\/span>/);
  assert.match(src, /data-testid="curtain-panel-note"[\s\S]{0,400}\{panel\.label\}[\s\S]{0,200}\{panel\.explainer\}/);
  assert.match(src, /data-testid="sticky-panel-line"[^>]*>\s*\{panel\.stickyLine\}/);
  assert.match(src, /value: panel \? panel\.label : product\.whatsIncluded/);
});

test("quantity 2 = 2 panels of the selected size: no bundle/pair logic added", () => {
  const src = read("../src/pages/ProductDetails.jsx");
  // Cart calls are unchanged: the shopper's own quantity and the selected size.
  assert.equal(src.match(/addToCart\(product, quantity, selectedVariant\)/g)?.length, 2);
  const helper = read("../src/utils/curtainPanel.js");
  assert.doesNotMatch(helper, /addToCart|setQuantity|\*\s*2\b/);
});

test("CX-04: floats lifted above the sticky buy bar only on the product page, below lg", () => {
  const pd = read("../src/pages/ProductDetails.jsx");
  assert.match(pd, /document\.body\.classList\.add\("has-sticky-buy-bar"\);\s*return \(\) => document\.body\.classList\.remove\("has-sticky-buy-bar"\);/);
  for (const f of ["../src/components/WhatsAppButton.jsx", "../src/components/BackToTopButton.jsx"]) {
    assert.match(read(f), /className="float-above-buybar fixed bottom-20 md:bottom-6/);
  }
  const css = read("../src/index.css");
  assert.match(css, /@media \(max-width: 1023\.98px\) \{\s*body\.has-sticky-buy-bar \.float-above-buybar \{\s*bottom: calc\(136px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  // Only ProductDetails sets the class.
  const hits = ["../src/pages/CategoryPage.jsx", "../src/App.jsx", "../src/layouts/MainLayout.jsx"].filter((f) => read(f).includes("has-sticky-buy-bar"));
  assert.deepEqual(hits, []);
});
