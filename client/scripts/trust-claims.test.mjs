// Homepage trust-claims audit 2026-11-24 (WC-01/02/04). The homepage
// promised "Real photos of every product — no stock images" while 104 of
// 204 products carry an "AI-enhanced or catalog images" note, "Easy
// Returns — Hassle-free" / "easy 7-day returns" while 54 of 204 products
// are not returnable, and "100%" safe checkout / genuine products. These
// checks are scoped to the components and meta lines that made those
// claims, not the whole source tree.
//   node --test scripts/trust-claims.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const WHY = read("src/components/WhyChooseUs/WhyChooseUs.jsx");
const TRUST = read("src/components/TrustBar/TrustBar.jsx");
const POPUP = read("src/components/WelcomeBenefitsPopup.jsx");
const HOME = read("src/pages/Home.jsx");
const ABOUT = read("src/pages/About.jsx");
const RENDER = read("api/render.js");

const HOME_META_EN =
  "Shop bedsheets, comforters & curtains online at Mittal Collections – UP delivery to eligible PINs, 24-hour delivery in selected Ghaziabad PINs and 7-day returns on eligible products.";
const HOME_META_HI =
  "Mittal Collections पर बेडशीट, कम्फर्टर और पर्दे ऑनलाइन खरीदें – उत्तर प्रदेश के चुनिंदा PIN codes पर डिलीवरी, गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे में डिलीवरी, योग्य प्रोडक्ट्स के लिए 7 दिनों के भीतर रिटर्न।";
const ABOUT_META =
  "Mittal Collections: a focused range of bedsheets, towels, curtains and cushions chosen for real material quality, not sheer catalog size. Delivery to eligible UP PIN codes, returns on eligible products, 24-hour delivery in selected Ghaziabad PIN codes.";

test("WC-01: WhyChooseUs has no 'real photos of every product / no stock images' card (EN + HI)", () => {
  assert.doesNotMatch(WHY, /Genuine Product Images|Real photos of every product|no stock images|exactly what you get/i);
  assert.doesNotMatch(WHY, /असली प्रोडक्ट फोटो|कोई स्टॉक इमेज नहीं|जो दिखे वही मिलेगा/);
  assert.equal((WHY.match(/^\s+title: "/gm) || []).length, 5, "five cards left");
});

test("WC-02: WhyChooseUs returns card says 'eligible products' and links the Returns Policy", () => {
  assert.doesNotMatch(WHY, /Easy Returns|Easy return policy|आसान रिटर्न/);
  assert.ok(WHY.includes("Returns are available on eligible products. Please check our "));
  assert.ok(WHY.includes("योग्य प्रोडक्ट्स पर रिटर्न उपलब्ध है। प्रोडक्ट के हिसाब से योग्यता और पूरी जानकारी के लिए हमारी "));
  assert.match(WHY, /RETURNS_POLICY_PATH/);
  assert.match(WHY, /<Link/);
});

test("WC-02: TrustBar says 'On eligible products', not 'Hassle-free'", () => {
  assert.doesNotMatch(TRUST, /Easy Returns|Hassle-free|आसान रिटर्न|झंझट/);
  assert.match(TRUST, /title: "Returns",\s*titleHi: "रिटर्न",\s*subtitle: "On eligible products",\s*subtitleHi: "योग्य प्रोडक्ट्स पर",/);
});

test("WC-02: welcome popup says 'Returns on eligible products'", () => {
  assert.doesNotMatch(POPUP, /"Easy Returns"|"आसान रिटर्न"/);
  assert.ok(POPUP.includes('t("Returns on eligible products", "योग्य प्रोडक्ट्स पर रिटर्न")'));
});

test("WC-02: homepage + About meta (visitor and bot) say 'on eligible products'", () => {
  for (const [file, src] of [["Home.jsx", HOME], ["render.js", RENDER]]) {
    assert.ok(src.includes(HOME_META_EN), `${file} EN meta`);
    assert.ok(src.includes(HOME_META_HI), `${file} HI meta`);
    assert.doesNotMatch(src, /easy 7-day returns|आसान 7 दिन में रिटर्न/, file);
  }
  for (const [file, src] of [["About.jsx", ABOUT], ["render.js", RENDER]]) {
    assert.ok(src.includes(ABOUT_META), `${file} About meta`);
    assert.ok(!src.includes("UP PIN codes, easy returns,"), file);
  }
});

test("WC-04: no '100%' claim in WhyChooseUs, TrustBar or the welcome popup", () => {
  for (const [name, src] of [["WhyChooseUs", WHY], ["TrustBar", TRUST], ["popup", POPUP]]) {
    assert.doesNotMatch(src, /100%/, name);
  }
  assert.ok(WHY.includes('text: "Secure checkout."') && WHY.includes('textHi: "सुरक्षित चेकआउट।"'));
  assert.match(TRUST, /subtitle: "Secure checkout",\s*subtitleHi: "सुरक्षित चेकआउट",/);
  assert.ok(POPUP.includes('t("Genuine Products", "असली प्रोडक्ट")'));
});
