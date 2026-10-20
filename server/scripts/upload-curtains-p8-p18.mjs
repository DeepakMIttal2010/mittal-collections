// Curtains batch P8-P18, continuing the existing P1-P7 line. Pricing
// per the user's explicit instruction this batch: purchasePrice 190
// (7x4) / 220 (9x4), stock 10 per size, misc 10% of purchasePrice.
// Formula matches P4-P7 exactly (see curtains_batch_p4_p7_2026-10-12
// memory): oldPrice = purchasePrice x 2.5, price = oldPrice x 0.85
// (15% off), Math.round on both.
import fs from "fs";
import path from "path";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const CATEGORY_ID = "6a6453c92bdcd87c2e0ce70a"; // Curtains
const SUBCAT_7X4 = "6a9a88df602a67023f047e09";
const SUBCAT_9X4 = "6a9a88e2602a67023f047e0a";
const SUBCAT_SATIN = "6ab0c56f1979b36c216488da";
const SUBCAT_VELVET = "6acce026b89d4f8c604da125";

const PP_7X4 = 190;
const PP_9X4 = 220;
const OLD_7X4 = Math.round(PP_7X4 * 2.5); // 475
const OLD_9X4 = Math.round(PP_9X4 * 2.5); // 550
const PRICE_7X4 = Math.round(OLD_7X4 * 0.85); // 404
const PRICE_9X4 = Math.round(OLD_9X4 * 0.85); // 468
const MISC = Math.round(PP_7X4 * 0.1); // 19, matches variants[0]/top-level purchasePrice convention

const BASE_DIR = "C:/Users/deepak.mittal/Downloads/DemoProject/P5-Curtains";

function careLine(fabric, isHindi) {
  if (fabric === "Velvet") {
    return isHindi
      ? "देखभाल: ड्राई क्लीन की सलाह दी जाती है। हाथ से धोना हो तो ठंडे पानी में माइल्ड डिटर्जेंट से धोएं, निचोड़ें नहीं, और पाइल बचाने के लिए सीधी धूप से दूर सुखाएं।"
      : "Care: dry clean recommended; if hand-washing, use cold water with a mild detergent, don't wring, and hang-dry away from direct sunlight to protect the pile";
  }
  return isHindi
    ? "देखभाल: ड्राई क्लीन की सलाह दी जाती है। हाथ से धोना हो तो ठंडे पानी में माइल्ड डिटर्जेंट से धोएं, निचोड़ें नहीं, और चमक बनाए रखने के लिए सीधी धूप से दूर सुखाएं।"
    : "Care: dry clean recommended; for hand-washing, use cold water with a mild detergent, avoid wringing, and dry away from direct sunlight to preserve the sheen";
}

function buildDescription({ intro, introHi, fabric }) {
  const fabricWord = fabric.toLowerCase();
  const fabricWordHi = fabric === "Velvet" ? "वेलवेट" : "सैटिन";
  const description = `<p>${intro}</p><ul><li>Same ${fabricWord} quality and stitching across both sizes — only the panel dimensions change</li><li>See the size selector above for exact stock and price per size</li><li>${careLine(fabric, false)}</li></ul>`;
  const descriptionHi = `<p>${introHi}</p><ul><li>दोनों साइज़ में एक जैसी ${fabricWordHi} क्वालिटी और सिलाई - सिर्फ पैनल का साइज़ बदलता है</li><li>सही कीमत और स्टॉक के लिए ऊपर साइज़ सिलेक्टर देखें</li><li>${careLine(fabric, true)}</li></ul>`;
  return { description, descriptionHi };
}

const PRODUCTS = [
  {
    folder: "P8",
    name: "Brown Blossom Branch Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "ब्राउन ब्लॉसम ब्रांच सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Ivory Brown",
    pattern: "Blossom Branch",
    intro:
      "An ivory satin curtain with a hand-painted brown blossom-branch print running top to bottom, finished with a dark brown eyelet header for an easy ripple-fold hang.",
    introHi:
      "यह आइवरी सैटिन पर्दा ऊपर से नीचे तक ब्राउन ब्लॉसम-ब्रांच प्रिंट के साथ आता है, ऊपर डार्क ब्राउन आईलेट हेडर के साथ जो आसान रिपल-फोल्ड हैंग देता है।",
  },
  {
    folder: "P9",
    name: "Slate Blue Leaf Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "स्लेट ब्लू लीफ सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Slate Blue",
    pattern: "Textured Leaf",
    intro:
      "A slate-blue satin curtain with an overlapping textured-leaf print in soft grey and ivory tones, finished with a matching eyelet header.",
    introHi:
      "यह स्लेट-ब्लू सैटिन पर्दा सॉफ्ट ग्रे और आइवरी टोन में ओवरलैपिंग टेक्सचर्ड-लीफ प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P10",
    name: "Dusty Rose Floral Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "डस्टी रोज़ फ्लोरल सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Dusty Rose",
    pattern: "Floral Bouquet",
    intro:
      "A dusty-rose satin curtain with a scattered ivory floral-bouquet print over a softly textured ground, finished with a matching eyelet header.",
    introHi:
      "यह डस्टी-रोज़ सैटिन पर्दा सॉफ्ट टेक्सचर्ड बैकग्राउंड पर बिखरे हुए आइवरी फ्लोरल-बूके प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P11",
    name: "Beige Floral Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "बेज फ्लोरल सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Beige",
    pattern: "Floral",
    intro:
      "A warm beige satin curtain with long-stemmed white poppy flowers printed across it, finished with a matching eyelet header for an easy ripple-fold hang.",
    introHi:
      "यह वार्म बेज सैटिन पर्दा लंबे तने वाले सफेद पॉपी फूलों के प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ जो आसान रिपल-फोल्ड हैंग देता है।",
  },
  {
    folder: "P12",
    name: "Coral Crackle Leaf Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "कोरल क्रैकल लीफ सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Coral",
    pattern: "Crackle Leaf",
    intro:
      "A coral-pink satin curtain with a bold crackle-veined leaf print in deep red tones, finished with a matching eyelet header.",
    introHi:
      "यह कोरल-पिंक सैटिन पर्दा गहरे लाल टोन में बोल्ड क्रैकल-वेंड लीफ प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P13",
    name: "Grey Crackle Leaf Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "ग्रे क्रैकल लीफ सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Grey",
    pattern: "Crackle Leaf",
    intro:
      "A heathered grey satin curtain with the same bold crackle-veined leaf print in charcoal and silver tones, finished with a matching eyelet header.",
    introHi:
      "यह हेदर्ड ग्रे सैटिन पर्दा चारकोल और सिल्वर टोन में क्रैकल-वेंड लीफ प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P14",
    name: "Taupe Leaf Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "टॉप लीफ सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Taupe",
    pattern: "Textured Leaf",
    intro:
      "A taupe-brown satin curtain with the same overlapping textured-leaf print in warm neutral tones, finished with a dark brown eyelet header.",
    introHi:
      "यह टॉप-ब्राउन सैटिन पर्दा वार्म न्यूट्रल टोन में ओवरलैपिंग टेक्सचर्ड-लीफ प्रिंट के साथ आता है, ऊपर डार्क ब्राउन आईलेट हेडर के साथ।",
  },
  {
    folder: "P15",
    name: "Slate Blue Floral Velvet Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "स्लेट ब्लू फ्लोरल वेलवेट आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Velvet",
    color: "Slate Blue",
    pattern: "Floral Vine",
    intro:
      "A slate-blue velvet curtain with a flowing silver-white floral-vine print across its crushed-texture pile, finished with a matching eyelet header.",
    introHi:
      "यह स्लेट-ब्लू वेलवेट पर्दा क्रश्ड-टेक्सचर पाइल पर बहते हुए सिल्वर-व्हाइट फ्लोरल-वाइन प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P16",
    name: "Mauve Floral Velvet Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "मौव फ्लोरल वेलवेट आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Velvet",
    color: "Mauve",
    pattern: "Floral Vine",
    intro:
      "A mauve velvet curtain with the same flowing ivory floral-vine print across its crushed-texture pile, finished with a matching eyelet header.",
    introHi:
      "यह मौव वेलवेट पर्दा क्रश्ड-टेक्सचर पाइल पर बहते हुए आइवरी फ्लोरल-वाइन प्रिंट के साथ आता है, ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P17",
    name: "Brown Palm Leaf Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "ब्राउन पाम लीफ सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Brown",
    pattern: "Palm Leaf",
    intro:
      "A two-tone brown satin curtain — ivory palm-leaf print on the upper panel, a solid textured brown base below — finished with a matching eyelet header.",
    introHi:
      "यह टू-टोन ब्राउन सैटिन पर्दा है - ऊपरी पैनल पर आइवरी पाम-लीफ प्रिंट, नीचे सॉलिड टेक्सचर्ड ब्राउन बेस - ऊपर मैचिंग आईलेट हेडर के साथ।",
  },
  {
    folder: "P18",
    name: "Teal Blossom Branch Satin Eyelet Curtain - 7x4 & 9x4 Ft",
    nameHi: "टील ब्लॉसम ब्रांच सैटिन आईलेट पर्दा - 7x4 और 9x4 फीट",
    fabric: "Satin",
    color: "Ivory Teal",
    pattern: "Blossom Branch",
    intro:
      "An ivory satin curtain with the same hand-painted blossom-branch print in teal and green tones, finished with a matching teal eyelet header.",
    introHi:
      "यह आइवरी सैटिन पर्दा टील और ग्रीन टोन में ब्लॉसम-ब्रांच प्रिंट के साथ आता है, ऊपर मैचिंग टील आईलेट हेडर के साथ।",
  },
];

async function uploadOne(p) {
  const folderPath = path.join(BASE_DIR, p.folder);
  const files = fs
    .readdirSync(folderPath)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No images found in ${folderPath}`);

  const { description, descriptionHi } = buildDescription(p);

  const variants = [
    { size: "7x4", price: PRICE_7X4, oldPrice: OLD_7X4, stock: 10, purchasePrice: PP_7X4 },
    { size: "9x4", price: PRICE_9X4, oldPrice: OLD_9X4, stock: 10, purchasePrice: PP_9X4 },
  ];

  const fd = new FormData();
  fd.append("name", p.name);
  fd.append("nameHi", p.nameHi);
  fd.append("description", description);
  fd.append("descriptionHi", descriptionHi);
  fd.append("category", CATEGORY_ID);
  fd.append(
    "subcategories",
    JSON.stringify([SUBCAT_7X4, SUBCAT_9X4, p.fabric === "Velvet" ? SUBCAT_VELVET : SUBCAT_SATIN]),
  );
  fd.append("variants", JSON.stringify(variants));
  fd.append("price", String(PRICE_7X4));
  fd.append("oldPrice", String(OLD_7X4));
  fd.append("purchasePrice", String(PP_7X4));
  fd.append("miscExpenses", String(MISC));
  fd.append("stock", "20");
  fd.append("mainImageIndex", "0");
  fd.append("fabric", p.fabric);
  fd.append("color", p.color);
  fd.append("pattern", p.pattern);
  fd.append("size", "7x4 & 9x4 Ft");
  fd.append("washCare", "Dry clean recommended, do not wring");
  fd.append("whatsIncluded", "1 Curtain Panel");
  fd.append("featured", "false");
  fd.append("isActive", "true");

  for (const f of files) {
    const buf = fs.readFileSync(path.join(folderPath, f));
    fd.append("images", new Blob([buf], { type: "image/jpeg" }), f);
  }

  const res = await fetch(`${BASE}/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: fd,
  });
  const data = await res.json();
  return { status: res.status, data };
}

for (const p of PRODUCTS) {
  console.log(`\nUploading ${p.folder}: ${p.name}...`);
  try {
    const { status, data } = await uploadOne(p);
    if (data.success) {
      console.log(`  OK (${status}) -> ${data.product._id} / ${data.product.slug}`);
    } else {
      console.log(`  FAILED (${status}):`, JSON.stringify(data));
    }
  } catch (e) {
    console.log(`  ERROR:`, e.message);
  }
}
