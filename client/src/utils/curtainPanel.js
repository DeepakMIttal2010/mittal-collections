// CX-01 (curtains audit 2026-11-17): every curtain is sold as ONE panel, but
// the photos show a pair hung on a window and the only "1 Curtain Panel"
// text sat in the spec table, far below the price. A shopper could read
// ₹404 as the price of a pair. This helper builds the one set of texts the
// product card, the price block and the mobile sticky bar all show, from
// the product and the size the shopper has selected, so the three places
// can never disagree after a size switch.
//
// Detection is data-driven: only a product whose whatsIncluded is exactly
// "1 Curtain Panel" (case/whitespace-insensitive) gets the panel texts.
// No category slug is hard-coded, so a future curtain pair set (with a
// different whatsIncluded) is not mislabelled.

const SINGLE_PANEL = "1 curtain panel";

export const PANEL_LABEL = { en: "1 Curtain Panel", hi: "1 पर्दा (सिंगल पैनल)" };
export const PER_PANEL = { en: "/ panel", hi: "/ पैनल" };

export function isSingleCurtainPanel(product) {
  return (
    typeof product?.whatsIncluded === "string" &&
    product.whatsIncluded.trim().replace(/\s+/g, " ").toLowerCase() === SINGLE_PANEL
  );
}

// "7x4" / "9x4" / "7 x 4 Ft" -> 4 (the second number is the width in feet).
// Anything else -> null, and the explainer then leaves the width out rather
// than guessing.
export function panelWidthFt(size) {
  const m = typeof size === "string" ? size.match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)?\s*$/i) : null;
  return m ? Number(m[2]) : null;
}

function sizeWithFt(size) {
  if (typeof size !== "string" || !size.trim()) return "";
  const s = size.trim();
  return /\b(ft|feet)\b/i.test(s) ? s : `${s} ft`;
}

// size = the selected variant's size (or the product's own size when it
// has no variants). Returns null for anything that is not a single panel.
export function curtainPanelTexts(product, size, isHindi) {
  if (!isSingleCurtainPanel(product)) return null;
  const lang = isHindi ? "hi" : "en";
  const width = panelWidthFt(size);
  const explainer = isHindi
    ? `कीमत एक पैनल की है${width ? ` (${width} फ़ीट चौड़ा)` : ""}। खिड़की के लिए जोड़ी चाहिए? मात्रा 2 रखें।`
    : `Price is for one panel${width ? ` (${width} ft wide)` : ""}. Need a pair for your window? Set quantity to 2.`;
  const sized = sizeWithFt(size);
  return {
    label: PANEL_LABEL[lang],
    perPanel: PER_PANEL[lang],
    explainer,
    stickyLine: sized ? `${PANEL_LABEL[lang]} · ${sized}` : PANEL_LABEL[lang],
  };
}
