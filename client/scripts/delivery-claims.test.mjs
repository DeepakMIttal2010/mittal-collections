// Guards the customer-facing copy against delivery claims the business
// can't honour: orders are accepted only for eligible Uttar Pradesh PIN
// codes (server/utils/deliveryEligibility.js), so nothing a customer, bot
// or crawler reads may promise delivery across India, a fixed 3-7 day
// window, or COD everywhere. Saying people can BROWSE from anywhere in
// India is fine. Also checks that copy duplicated between the React app
// and the bot prerender (api/render.js) stays word for word the same.
//   node --test scripts/delivery-claims.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), "utf8");

const MISLEADING = [
  /\bpan[- ]?india\b/i,
  /\bdeliver(?:s|ed|y|ing)?\s+(?:anywhere\s+in|across|all\s+over|throughout|to\s+all\s+of)\s+india\b/i,
  /\bship(?:s|ped|ping)?\s+(?:anywhere\s+in|across|all\s+over|throughout|everywhere\s+in)\s+india\b/i,
  /\b(?:cod|cash on delivery)\b[^.]{0,60}\b(?:all orders|across india|everywhere)\b/i,
  /\bserving customers across india\b/i,
  /\bcustomers across india\b/i,
  /\b3\s*[-–]\s*7\s+(?:business\s+)?days\b/i,
  /पूरे\s+भारत\s+में\s+(?:डिलीवरी|डिलीवर|शिपिंग|सभी\s+ऑर्डर|ग्राहकों|सैकड़ों)/,
  /3\s*[-–]\s*7\s+(?:कार्य\s+)?(?:दिन|दिवस)/,
  // The local facility is "within 24 hours in selected Ghaziabad PIN codes"
  // — never same-day, guaranteed, or all of Ghaziabad.
  /\bsame[- ]day\b/i,
  /सेम-डे|उसी\s+दिन/,
  /\bacross\s+(?:all\s+(?:of\s+)?)?ghaziabad\b/i,
  /\bguarantee(?:d|s)?\b[^.]{0,30}\b(?:deliver|24)/i,
];

// Fixed delivery-time promises (no general delivery window is confirmed
// for the rest of UP). Checked per sentence, and only when the sentence is
// about delivery — the local Ghaziabad promise and return/refund timings
// are allowed.
const FIXED_DELIVERY_TIME = [
  /\b\d+\s*[-–]\s*\d+\s+(?:business\s+|working\s+)?days\b/i,
  /\b(?:in|within)\s+\d+\s+(?:business\s+|working\s+)?(?:days|hours)\b/i,
  /\bnext[- ]day\b/i,
  /\bsame[- ]day\b/i,
  /\d+\s*[-–]\s*\d+\s+(?:कार्य\s+)?(?:दिन|दिवस)/,
  /\d+\s+(?:घंटे|दिन)\s+में/,
  /\b24[- ]?(?:hours?|hrs?)\b/i,
  /24\s+घंटे/,
];
// Dispatch (handling) time is the seller's own promise, not a delivery
// window, so it isn't matched here.
const ABOUT_DELIVERY = /\bdeliver|\bshipping\b|\barriv|डिलीवर|डिलीवरी|पहुँच|शिपिंग/i;
// Return/refund timings aren't delivery promises. The 24-hour facility is
// allowed only when the sentence itself limits it to selected PIN codes —
// naming Ghaziabad alone is not enough.
const RETURNS = /\breturn|\brefund|रिटर्न|रिफंड/i;
const QUALIFIED_LOCAL = /\bselected\b.{0,30}\b(?:ghaziabad|pin)|चुनिंदा\s+PIN/i;

const findFixedDeliveryTimes = (text) =>
  text
    .split(/(?<=[.!?।])\s+|\n/)
    .filter((sentence) => ABOUT_DELIVERY.test(sentence) && !RETURNS.test(sentence) && !QUALIFIED_LOCAL.test(sentence))
    .filter((sentence) => FIXED_DELIVERY_TIME.some((re) => re.test(sentence)));

const findClaims = (text) => [
  ...MISLEADING.filter((re) => re.test(text)).map(String),
  ...findFixedDeliveryTimes(text),
];

// Exact local-context strings that pass the sentence check only because the
// area is named on a neighbouring line (each is shown solely to Ghaziabad
// visitors / Ghaziabad PINs, with the Footer's cutoff-time disclaimer).
const LOCAL_ONLY_STRINGS = [
  // DeliveryOfferBanner / Footer: Ghaziabad-visitor branch only.
  '"FAST DELIVERY within 24 Hours", "24 घंटे में तेज़ डिलीवरी"',
  '"🚚 FAST DELIVERY within 24 Hours*", "🚚 24 घंटे में तेज़ डिलीवरी*"',
  // PincodeChecker: only when the PIN is in the fast-delivery area.
  "`✅ Eligible for 24-Hour Express Delivery — ${result.areaName}`",
  "`✅ 24 घंटे में एक्सप्रेस डिलीवरी के लिए योग्य — ${result.areaName}`",
];

const APPROVED_24H_EN =
  "Delivery within 24 hours in selected Ghaziabad PIN codes, subject to product availability and order confirmation. Orders confirmed later in the day may be delivered the following day.";
const APPROVED_24H_HI =
  "गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे के अंदर डिलीवरी की सुविधा उपलब्ध है। यह उत्पाद की उपलब्धता और ऑर्डर की पुष्टि पर निर्भर है। दिन में देर से कन्फर्म हुए ऑर्डर की डिलीवरी अगले दिन हो सकती है।";

// Comments may describe the old wording; only shipped strings matter.
const stripComments = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const walk = (dir) =>
  fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [rel] : [];
  });

// Admin-only screens are out of scope (staff tooltips, not customer copy).
const isAdmin = (rel) => /\/admin\//.test(rel) || /Admin[A-Z]/.test(path.basename(rel));

const CUSTOMER_FILES = [
  ...walk("client/src").filter((rel) => !isAdmin(rel) && !rel.endsWith(".test.js")),
  "client/api/render.js",
  "client/public/llms.txt",
  "client/index.html",
  "server/data/pages.js",
];

test("the matcher flags nationwide delivery claims and leaves allowed wording alone", () => {
  for (const bad of [
    "PAN-INDIA DELIVERY",
    "We Deliver Pan-India",
    "Delivered anywhere in India, with fast 24-hour delivery in Ghaziabad.",
    "with delivery across India and same-day express delivery",
    "Cash on Delivery is available on all orders across India",
    "Trusted by hundreds of happy customers across India.",
    "Usually delivered in 3-7 business days",
    "पूरे भारत में डिलीवरी",
    "आमतौर पर 3-7 कार्य दिवस",
    "Your order will be delivered in 2-4 business days.",
    "We deliver within 48 hours.",
    "Next-day delivery on all orders.",
    "Orders are delivered in 2 days.",
    "ऑर्डर 2-4 कार्य दिवस में डिलीवर होगा।",
    "Same-day delivery within 24 Hours in Ghaziabad (Vasundhara, Vaishali, Indirapuram & nearby).",
    "गाज़ियाबाद में 24 घंटे में सेम-डे डिलीवरी।",
    "ग़ाज़ियाबाद में उसी दिन डिलीवरी के साथ।",
    "24-hour delivery across Ghaziabad, including:",
    "Guaranteed 24-hour delivery in Ghaziabad.",
    "Fast 24-hour delivery in Ghaziabad.",
    "Free Delivery Within 24 Hours — Vasundhara & nearby 10 km",
    "24 घंटे में मुफ़्त डिलीवरी — वसुंधरा और आसपास 10 किमी",
  ]) {
    assert.notDeepEqual(findClaims(bad), [], `should flag: ${bad}`);
  }

  for (const ok of [
    "Browse our collection from anywhere in India. Delivery is currently available only to eligible PIN codes in Uttar Pradesh.",
    "आप भारत के किसी भी हिस्से से हमारा कलेक्शन देख सकते हैं। फिलहाल डिलीवरी केवल उत्तर प्रदेश के चुनिंदा PIN codes पर उपलब्ध है।",
    "Transform Every Corner of your Home",
    "Cash on Delivery may be available for eligible PIN codes and orders.",
    "24-Hour Delivery in Selected Ghaziabad PIN Codes*",
    "गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी*",
    "your refund is processed within 5-7 business days",
    "You can return an unused product in its original packaging within 7 days of delivery.",
    "Delivery availability is confirmed after PIN code verification.",
    "Orders are generally dispatched within 1–2 business days after order confirmation, subject to product availability.",
    "ऑर्डर की पुष्टि और उत्पाद की उपलब्धता के बाद सामान्यतः 1–2 कार्यदिवस में पार्सल भेज दिया जाता है।",
    APPROVED_24H_EN,
    APPROVED_24H_HI,
  ]) {
    assert.deepEqual(findClaims(ok), [], `should allow: ${ok}`);
  }
});

test("customer-facing source and output contain no misleading delivery claims", () => {
  const offenders = CUSTOMER_FILES.flatMap((rel) => {
    const text = rel.endsWith(".txt") || rel.endsWith(".html") ? read(rel) : stripComments(read(rel));
    return text
      .split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => findClaims(line).length > 0)
      .filter(({ line }) => !LOCAL_ONLY_STRINGS.some((allowed) => line.includes(allowed)))
      .map(({ line, i }) => `${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });

  assert.deepEqual(offenders, []);
});

test("bot prerender and React app use the same delivery wording", () => {
  const render = read("client/api/render.js");
  const pairs = {
    "client/src/pages/Home.jsx": [
      "Shop bedsheets, comforters & curtains online at Mittal Collections – UP delivery to eligible PINs, 24-hour delivery in selected Ghaziabad PINs and easy 7-day returns.",
      "Mittal Collections पर बेडशीट, कम्फर्टर और पर्दे ऑनलाइन खरीदें – उत्तर प्रदेश के चुनिंदा PIN codes पर डिलीवरी, गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी, आसान 7 दिन में रिटर्न।",
    ],
    "client/src/pages/About.jsx": ["Delivery to eligible UP PIN codes, easy returns, 24-hour delivery in selected Ghaziabad PIN codes."],
    "client/src/pages/GhaziabadStore.jsx": [
      "with delivery within 24 hours in selected Ghaziabad PIN codes (Vasundhara, Vaishali, Indirapuram and nearby).",
      "Delivery within 24 hours is available in selected Ghaziabad PIN codes in these areas, subject to product availability and order confirmation (orders confirmed later in the day may be delivered the following day):",
    ],
    "client/src/pages/ProductDetails.jsx": [
      "}. 24-hour delivery in selected Ghaziabad PIN codes. ${",
      "}। गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी। ${",
      ", 24-hour delivery in selected Ghaziabad PIN codes`",
      ", गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी`",
    ],
  };

  for (const [file, phrases] of Object.entries(pairs)) {
    const source = read(file);
    for (const phrase of phrases) {
      assert.ok(source.includes(phrase), `${file} missing: ${phrase}`);
      assert.ok(render.includes(phrase), `api/render.js missing: ${phrase}`);
    }
  }

  // Category meta lead-in: render.js's deliveryLine + "." / "।".
  const category = read("client/src/pages/CategoryPage.jsx");
  assert.ok(category.includes('"24-hour delivery in selected Ghaziabad PIN codes."'));
  assert.ok(category.includes('"गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी।"'));
  assert.ok(
    render.includes('"गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी" : "24-hour delivery in selected Ghaziabad PIN codes"'),
  );
});

test("the approved 24-hour wording is used word for word in FAQ, footer and llms.txt", () => {
  for (const file of ["client/src/components/Faq/Faq.jsx", "client/src/components/Footer/Footer.jsx"]) {
    const source = read(file);
    assert.ok(source.includes(APPROVED_24H_EN), `${file} missing approved EN 24-hour wording`);
    assert.ok(source.includes(APPROVED_24H_HI), `${file} missing approved HI 24-hour wording`);
  }
  assert.ok(read("client/public/llms.txt").includes(APPROVED_24H_EN));
  assert.ok(read("client/api/render.js").includes(APPROVED_24H_EN), "bot FAQ JSON-LD missing approved wording");
});

test("FAQ JSON-LD answers in the bot prerender match the visible FAQ", () => {
  const faq = read("client/src/components/Faq/Faq.jsx");
  const render = read("client/api/render.js");
  const start = render.indexOf("const faqJsonLd = {");
  const block = render.slice(start, render.indexOf("};", start));
  const answers = [...block.matchAll(/text: (["`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);

  assert.equal(answers.length, 6);
  for (const answer of answers) {
    assert.ok(faq.includes(answer), `Faq.jsx missing FAQ answer: ${answer.slice(0, 80)}`);
  }
});
