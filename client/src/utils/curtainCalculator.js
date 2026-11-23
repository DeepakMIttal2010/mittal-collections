// Curtain Size Calculator logic (audit 2026-11-22, CS-01/02/03/05/08;
// owner decisions D1-D7). Pure functions, no React -- unit tested in
// scripts/curtain-calculator.test.mjs, and FAQS_EN is mirrored by hand in
// api/render.js (scripts/render-curtain-calculator.test.mjs keeps the two
// in sync).
//
// Business constraint (owner, 2026-11-22): every curtain we sell is ONE
// eyelet panel, 4 ft (48") wide, in exactly two lengths -- 7x4 ft (84") and
// 9x4 ft (108"), always written length x width. No other width, no custom
// stitching. So the calculator never invents a size: it counts how many
// 4 ft panels the rod needs and picks the shortest stocked length that
// covers the final curtain length -- or says plainly that none does.

export const PANEL_WIDTH_IN = 48;

export const CURTAIN_SIZES = [
  { key: "7x4", lengthIn: 84, widthIn: 48, label: "7×4 ft", labelHi: "7×4 फीट", subcategorySlug: "7x4-ft" },
  { key: "9x4", lengthIn: 108, widthIn: 48, label: "9×4 ft", labelHi: "9×4 फीट", subcategorySlug: "9x4-ft" },
];
const LONGEST = CURTAIN_SIZES[CURTAIN_SIZES.length - 1];

// D3: the drop input is measured from the rod to the floor; clearance is
// then applied to get the final curtain length the size is matched on.
export const CLEARANCE_IN = { above: -1, touching: 0, puddle: 3 };

// A stocked curtain up to this much longer than needed still "fits".
export const FIT_TOLERANCE_IN = 2;
// D6: how far we suggest moving the rod, at most.
export const RAISE_MAX_IN = 6;
export const LOWER_MAX_IN = 3;

export const LIMITS = {
  widthIn: [12, 300],
  dropIn: [24, 144],
  overhangIn: [0, 24],
};

// D1 (1.5x), D2 (opens both sides), D3 (just above floor).
export const CURTAIN_DEFAULTS = {
  widthIn: 48,
  dropIn: 84,
  mount: "outside",
  overhangIn: 4,
  fullness: 1.5,
  opening: "both",
  clearance: "above",
};

// D7: rod-to-floor presets.
export const CURTAIN_PRESETS = [
  { key: "window", label: "Window", labelHi: "विंडो", widthIn: 48, dropIn: 84 },
  { key: "wide-window", label: "Wide window", labelHi: "चौड़ी विंडो", widthIn: 72, dropIn: 84 },
  { key: "door", label: "Door", labelHi: "डोर", widthIn: 36, dropIn: 88 },
  { key: "tall-door", label: "Tall door / French", labelHi: "लंबा डोर / फ्रेंच", widthIn: 60, dropIn: 108 },
];

const round1 = (n) => Math.round(n * 10) / 10;

// "" / null -> required, non-numeric -> invalid, outside [min, max] -> range.
function readNumber(value, [min, max]) {
  if (value === "" || value === null || value === undefined) return { error: "required" };
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return { error: "invalid" };
  if (n < min || n > max || (min > 0 && n <= 0)) return { error: "range" };
  return { value: n };
}

function sizeFor(lengthIn) {
  return CURTAIN_SIZES.find((s) => s.lengthIn >= lengthIn) || null;
}

// D5/D6: only suggest moving the rod when doing so makes a stocked size
// fit within FIT_TOLERANCE_IN. Raising the rod adds to the rod-to-floor
// distance (needs a longer curtain); lowering it subtracts.
function rodTip(finalLengthIn, size) {
  const candidates = [];
  if (size) {
    const extra = size.lengthIn - finalLengthIn;
    if (extra > FIT_TOLERANCE_IN && extra <= RAISE_MAX_IN) {
      candidates.push({ direction: "raise", inches: extra, size });
    }
    // A shorter stocked size that fits if the rod comes down a little.
    const shorter = CURTAIN_SIZES.filter((s) => s.lengthIn < size.lengthIn).pop();
    if (shorter && extra > FIT_TOLERANCE_IN) {
      const down = finalLengthIn - shorter.lengthIn;
      if (down > 0 && down <= LOWER_MAX_IN) candidates.push({ direction: "lower", inches: down, size: shorter });
    }
  } else {
    const down = finalLengthIn - LONGEST.lengthIn;
    if (down > 0 && down <= LOWER_MAX_IN) candidates.push({ direction: "lower", inches: down, size: LONGEST });
  }
  for (const c of candidates) {
    const newFinal = finalLengthIn + (c.direction === "raise" ? c.inches : -c.inches);
    const residualIn = c.size.lengthIn - newFinal;
    if (residualIn >= 0 && residualIn <= FIT_TOLERANCE_IN) return { ...c, residualIn };
  }
  return null;
}

export function calculateCurtain(input) {
  const { mount, fullness, opening, clearance } = input;
  const errors = {};
  const width = readNumber(input.widthIn, LIMITS.widthIn);
  if (width.error) errors.width = width.error;
  const drop = readNumber(input.dropIn, LIMITS.dropIn);
  if (drop.error) errors.drop = drop.error;
  let overhang = { value: 0 };
  if (mount === "outside") {
    overhang = readNumber(input.overhangIn, LIMITS.overhangIn);
    if (overhang.error) errors.overhang = overhang.error;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const rodLengthIn = width.value + overhang.value * 2;
  const needed = (rodLengthIn * fullness) / PANEL_WIDTH_IN;
  let panels = Math.max(Math.ceil(needed - 1e-9), 1);
  if (opening === "both" && panels % 2 === 1) panels += 1;
  const achievedFullness = round1((panels * PANEL_WIDTH_IN) / rodLengthIn);

  const finalLengthIn = drop.value + (CLEARANCE_IN[clearance] ?? 0);
  const size = sizeFor(finalLengthIn);
  const extraIn = size ? round1(size.lengthIn - finalLengthIn) : null;
  const shortByIn = size ? null : round1(finalLengthIn - LONGEST.lengthIn);

  return {
    ok: true,
    rodLengthIn: round1(rodLengthIn),
    panels,
    achievedFullness,
    finalLengthIn: round1(finalLengthIn),
    size,
    extraIn,
    shortByIn,
    fits: Boolean(size) && extraIn <= FIT_TOLERANCE_IN,
    tip: rodTip(finalLengthIn, size),
  };
}

// D4: designs (products) that have at least `panels` pieces of this size
// in stock. Products without size variants are never counted (no guessing);
// null when there is no product list at all (API failed) so the page can
// hide the line instead of showing a fabricated "0".
export function countDesignsInStock(products, sizeKey, panels) {
  if (!Array.isArray(products)) return null;
  const norm = (s) => String(s || "").toLowerCase().replace(/\s|ft|feet/g, "");
  return products.filter((p) => {
    if (p?.isActive === false || !Array.isArray(p?.variants)) return false;
    const v = p.variants.find((x) => norm(x.size) === sizeKey);
    return Boolean(v) && Number(v.stock) >= panels;
  }).length;
}

const inch = (n) => `${n}"`;

export function formatTip(tip, lang) {
  if (!tip) return "";
  const label = lang === "hi" ? tip.size.labelHi : tip.size.label;
  if (lang === "hi") {
    const dir = tip.direction === "raise" ? "ऊपर" : "नीचे";
    return `रॉड को ${inch(tip.inches)} ${dir} लगाएं तो ${label} बिल्कुल फ़िट होगा — सिर्फ़ तब, जब रॉड विंडो/डोर फ्रेम के ऊपर ही रहे${tip.direction === "raise" ? " और दीवार पर इतनी जगह हो" : ""}।`;
  }
  const dir = tip.direction === "raise" ? "higher" : "lower";
  return `Hang the rod ${inch(tip.inches)} ${dir} and ${label} fits exactly — only if the rod still sits above the window/door frame${tip.direction === "raise" ? " and there is wall space for it" : ""}.`;
}

const FIELD_LABELS = {
  width: ["window width", "विंडो की चौड़ाई"],
  drop: ["rod-to-floor measurement", "रॉड से फ़र्श तक का माप"],
  overhang: ["overhang", "ओवरहैंग"],
};
const FIELD_LIMITS = { width: LIMITS.widthIn, drop: LIMITS.dropIn, overhang: LIMITS.overhangIn };

export function formatError(field, code, lang) {
  const [en, hi] = FIELD_LABELS[field];
  const [min, max] = FIELD_LIMITS[field];
  if (lang === "hi") {
    if (code === "required") return `${hi} इंच में डालें।`;
    if (code === "invalid") return `${hi} सिर्फ़ अंकों में डालें।`;
    return `${hi} ${min} से ${max} इंच के बीच होनी चाहिए।`;
  }
  if (code === "required") return `Enter the ${en} in inches.`;
  if (code === "invalid") return `Enter the ${en} as a number.`;
  return `The ${en} must be between ${min} and ${max} inches.`;
}

export const CURTAIN_FAQS = [
  {
    q: "How do I calculate curtain size from window measurements?",
    a: "Measure your window's width, and the drop from where the rod will sit down to the floor, in inches. The calculator adds the rod overhang, multiplies by your chosen fullness (1.5x is standard, 2x for a fuller look), tells you how many of our 4 ft wide panels to hang and whether the 7×4 ft or 9×4 ft length fits.",
    qHi: "विंडो के माप से कर्टन साइज़ कैसे निकालें?",
    aHi: "अपनी विंडो की चौड़ाई, और जहां रॉड लगेगी वहां से फ़र्श तक का ड्रॉप इंच में मापें। कैलकुलेटर रॉड का ओवरहैंग जोड़ता है, आपकी चुनी फुलनेस (1.5x स्टैंडर्ड है, 2x ज़्यादा भरे लुक के लिए) से गुणा करता है, और बताता है कि हमारे 4 फीट चौड़े कितने पैनल लगाने हैं और 7×4 फीट या 9×4 फीट में से कौन सी लंबाई फ़िट होगी।",
  },
  {
    q: "How do I calculate curtain rod length?",
    a: "Rod length = window width + overhang on each side. For an outside-mount rod, add 4–6 inches of overhang per side so the curtain can fully clear the window when opened. Enter your window width above and pick \"Outside Mount\" to get the exact rod length.",
    qHi: "कर्टन रॉड की लंबाई कैसे निकालें?",
    aHi: "रॉड की लंबाई = विंडो की चौड़ाई + हर तरफ ओवरहैंग। आउटसाइड-माउंट रॉड के लिए, हर तरफ 4-6 इंच ओवरहैंग जोड़ें ताकि खोलने पर कर्टन पूरी तरह विंडो से हट जाए। सटीक रॉड लंबाई के लिए ऊपर अपनी विंडो चौड़ाई डालें और \"आउटसाइड माउंट\" चुनें।",
  },
  {
    q: "Does this calculator work in inches or feet?",
    a: "Enter your measurements in inches (the most common way windows are measured in India). Our curtains are sold in feet, written length × width — 7×4 ft (84 x 48 inches) and 9×4 ft (108 x 48 inches) — and the calculator matches your measurements to one of these.",
    qHi: "क्या यह कैलकुलेटर इंच या फीट में काम करता है?",
    aHi: "अपने माप इंच में डालें (भारत में विंडो मापने का सबसे आम तरीका)। हमारे कर्टन फीट में, लंबाई × चौड़ाई के रूप में बिकते हैं — 7×4 फीट (84 x 48 इंच) और 9×4 फीट (108 x 48 इंच) — और कैलकुलेटर आपके माप को इन्हीं में से एक से मिलाता है।",
  },
  {
    q: "How much fabric width do I need for curtains?",
    a: "For a natural, gathered drape, the total curtain width should be 1.5–2.5 times your rod length — 1.5x is standard and 2x gives a fuller look. Each of our panels is 4 ft (48 inches) wide, so the calculator tells you how many panels to hang side by side.",
    qHi: "कर्टन के लिए कितनी फैब्रिक चौड़ाई चाहिए?",
    aHi: "नैचुरल, गैदर्ड ड्रेप के लिए कर्टन की कुल चौड़ाई रॉड की लंबाई की 1.5-2.5 गुना होनी चाहिए — 1.5x स्टैंडर्ड है और 2x ज़्यादा भरा लुक देता है। हमारा हर पैनल 4 फीट (48 इंच) चौड़ा है, इसलिए कैलकुलेटर बताता है कि साथ-साथ कितने पैनल लगाने हैं।",
  },
  {
    q: "What curtain sizes do you sell?",
    a: "Our eyelet curtains come in two sizes, written length × width: 7×4 ft for windows (rod about 7 ft from the floor) and 9×4 ft for doors and tall windows (rod about 9 ft from the floor). Every panel is 4 ft wide — for a wider window, hang more panels side by side.",
    qHi: "आप कौन से कर्टन साइज़ बेचते हैं?",
    aHi: "हमारे आईलेट कर्टन दो साइज़ में आते हैं, लंबाई × चौड़ाई: विंडो के लिए 7×4 फीट (रॉड फ़र्श से लगभग 7 फीट) और डोर व लंबी विंडो के लिए 9×4 फीट (रॉड फ़र्श से लगभग 9 फीट)। हर पैनल 4 फीट चौड़ा है — चौड़ी विंडो के लिए साथ-साथ ज़्यादा पैनल लगाएं।",
  },
];

// English-only copy for the FAQPage JSON-LD (page language is English).
export const FAQS_EN = CURTAIN_FAQS.map((f) => ({ q: f.q, a: f.a }));

// The page's static copy, EN + HI (CS-04, 2026-11-23). CurtainSizeCalculator.jsx
// renders it; api/render.js mirrors the English by hand for bots (it can't
// import client ESM) and scripts/render-curtain-calculator.test.mjs checks
// the bot body against PAGE_COPY_EN, so a visitor and a bot read the same
// words.
export const CURTAIN_PAGE_COPY = {
  heading: { en: "Curtain Size Calculator", hi: "कर्टन साइज़ कैलकुलेटर" },
  intro: {
    en: "Measure your window once, answer a few quick questions, and see which of our curtains fits — 7×4 ft or 9×4 ft — and how many 4 ft panels you need.",
    hi: "अपनी विंडो को एक बार मापें, कुछ छोटे सवालों के जवाब दें, और देखें कि हमारे कौन से कर्टन फ़िट होंगे — 7×4 फीट या 9×4 फीट — और 4 फीट के कितने पैनल चाहिए।",
  },
  measure: {
    heading: { en: "How to measure your window for curtains", hi: "कर्टन के लिए अपनी विंडो कैसे मापें" },
    text: {
      en: "Use a metal tape measure, not cloth, for accuracy. For width, measure the window frame edge to edge — the calculator adds the overhang and fullness for you. For length, decide first where the rod will sit (usually 4–6 inches above the frame), then measure straight down from the rod to the floor and pick how the curtain should meet the floor.",
      hi: "सटीकता के लिए कपड़े की नहीं, धातु की टेप माप का इस्तेमाल करें। चौड़ाई के लिए, विंडो फ्रेम को किनारे से किनारे तक मापें — कैलकुलेटर ओवरहैंग और फुलनेस अपने आप जोड़ देता है। लंबाई के लिए, पहले तय करें कि रॉड कहां बैठेगी (आमतौर पर फ्रेम से 4-6 इंच ऊपर), फिर रॉड से सीधे फ़र्श तक मापें और चुनें कि कर्टन फ़र्श पर कैसे पहुंचे।",
    },
    guidePrompt: { en: "Prefer a written, step-by-step version? ", hi: "लिखित, स्टेप-बाय-स्टेप वर्शन चाहिए? " },
    guideLinkText: { en: "Read our full curtain measurement guide →", hi: "हमारी पूरी कर्टन मेज़रमेंट गाइड पढ़ें →" },
    guidePath: "/articles/curtain-measurement-guide",
  },
  sizes: {
    heading: { en: "Our Curtain Sizes", hi: "हमारे कर्टन साइज़" },
    intro: {
      en: "Every panel is 4 ft (48 inches) wide. Sizes are written length × width. For a wider window, hang more panels side by side.",
      hi: "हर पैनल 4 फीट (48 इंच) चौड़ा है। साइज़ लंबाई × चौड़ाई में लिखे हैं। चौड़ी विंडो के लिए साथ-साथ ज़्यादा पैनल लगाएं।",
    },
    columns: {
      size: { en: "Size", hi: "साइज़" },
      fits: { en: "Fits", hi: "किसके लिए" },
      use: { en: "Best For", hi: "सबसे उपयुक्त" },
    },
    rows: [
      {
        sizeKey: "7x4",
        fits: { en: 'Rod up to 84" (7 ft) from the floor', hi: 'रॉड फ़र्श से 84" (7 फीट) तक' },
        use: { en: "Windows", hi: "विंडो" },
      },
      {
        sizeKey: "9x4",
        fits: { en: 'Rod up to 108" (9 ft) from the floor', hi: 'रॉड फ़र्श से 108" (9 फीट) तक' },
        use: { en: "Doors and tall windows", hi: "डोर और लंबी विंडो" },
      },
    ],
  },
  faqHeading: { en: "Frequently Asked Questions", hi: "अक्सर पूछे जाने वाले सवाल" },
};

const sizeByKey = (key) => CURTAIN_SIZES.find((s) => s.key === key);

// English view of CURTAIN_PAGE_COPY -- exactly what api/render.js mirrors.
export const PAGE_COPY_EN = {
  heading: CURTAIN_PAGE_COPY.heading.en,
  intro: CURTAIN_PAGE_COPY.intro.en,
  measure: {
    heading: CURTAIN_PAGE_COPY.measure.heading.en,
    text: CURTAIN_PAGE_COPY.measure.text.en,
    guidePrompt: CURTAIN_PAGE_COPY.measure.guidePrompt.en,
    guideLinkText: CURTAIN_PAGE_COPY.measure.guideLinkText.en,
    guidePath: CURTAIN_PAGE_COPY.measure.guidePath,
  },
  sizes: {
    heading: CURTAIN_PAGE_COPY.sizes.heading.en,
    intro: CURTAIN_PAGE_COPY.sizes.intro.en,
    columns: {
      size: CURTAIN_PAGE_COPY.sizes.columns.size.en,
      fits: CURTAIN_PAGE_COPY.sizes.columns.fits.en,
      use: CURTAIN_PAGE_COPY.sizes.columns.use.en,
    },
    rows: CURTAIN_PAGE_COPY.sizes.rows.map((row) => ({
      label: sizeByKey(row.sizeKey).label,
      path: `/category/curtains/${sizeByKey(row.sizeKey).subcategorySlug}`,
      fits: row.fits.en,
      use: row.use.en,
    })),
  },
  faqHeading: CURTAIN_PAGE_COPY.faqHeading.en,
};
