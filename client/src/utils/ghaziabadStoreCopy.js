// Static copy of /ghaziabad-home-furnishing-store, EN + HI (audit
// 2026-11-23, GZ-01/02/03/05). GhaziabadStore.jsx renders it; api/render.js
// mirrors the English and the walk-in switch by hand for bots (it can't
// import client ESM) and scripts/render-ghaziabad-store.test.mjs fails if
// the two differ, so a visitor and a bot read the same words.

// GZ-05: the shop is closed to walk-ins until it reopens (planned Dec 2026).
// When it reopens, set this to true here AND GHAZIABAD_WALK_IN_OPEN in
// api/render.js (the render test checks they match) -- the walk-in note
// then disappears for visitors and bots together.
export const WALK_IN_OPEN = false;

// The public Returns & Refunds policy. Not /returns -- that is the
// logged-in "Your Returns" page.
export const RETURNS_POLICY_PATH = "/policies/returns";

export const GHAZIABAD_COPY = {
  heading: { en: "Home Furnishing Store in Ghaziabad", hi: "गाजियाबाद में होम फर्निशिंग स्टोर" },
  tagline: {
    en: "Shop online from home, from your nearby local store",
    hi: "घर बैठे ऑनलाइन शॉपिंग करें अपने नज़दीकी स्टोर से",
  },
  subTagline: {
    en: "The same trusted quality from our shop — now online, only at mittalcollections.com",
    hi: "वही दुकान वाली क्वालिटी और भरोसा — अब सिर्फ mittalcollections.com पर ऑनलाइन",
  },
  intro: {
    en: "Mittal Collections is based in Sector 3, Vasundhara, Ghaziabad — a home furnishing store offering bedsheets, curtains, towels, cushions and doormats, with delivery within 24 hours in selected Ghaziabad PIN codes.",
    hi: "मित्तल कलेक्शंस गाजियाबाद के सेक्टर-3, वसुंधरा में स्थित एक होम फर्निशिंग स्टोर है — बेडशीट, पर्दे, तौलिए, कुशन और डोरमैट, गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे के अंदर डिलीवरी की सुविधा के साथ।",
  },
  // Each bullet is a list of parts; a part with a path is a link.
  // GZ-02: the "Real photos ... what you see is exactly what reaches your
  // door" bullet was removed (about half the catalogue carries an
  // AI-enhanced/catalog image note). GZ-03: "Easy, hassle-free returns"
  // replaced -- some products are not returnable.
  bullets: [
    [{ en: "Trusted by Ghaziabad families since 2021.", hi: "2021 से गाजियाबाद के परिवारों का भरोसा।" }],
    [
      {
        en: "Returns are available on eligible products. Please check our ",
        hi: "योग्य प्रोडक्ट्स पर रिटर्न उपलब्ध है। प्रोडक्ट के हिसाब से योग्यता और पूरी जानकारी के लिए हमारी ",
      },
      { en: "Returns Policy", hi: "रिटर्न पॉलिसी", path: RETURNS_POLICY_PATH },
      { en: " for product-wise eligibility and details.", hi: " देखें।" },
    ],
    [
      {
        en: "From Vasundhara to Vaishali, Indirapuram to Kaushambi — fast local delivery, right to your doorstep.",
        hi: "वसुंधरा से वैशाली, इंदिरापुरम से कौशांबी तक — तेज़ लोकल डिलीवरी, सीधे आपके दरवाज़े तक।",
      },
    ],
    [
      {
        en: "Quality home furnishing, fair prices, and the same trust as our physical store — only at mittalcollections.com.",
        hi: "क्वालिटी होम फर्निशिंग, सही कीमत, और हमारी असली दुकान जैसा भरोसा — सिर्फ mittalcollections.com पर।",
      },
    ],
  ],
  visit: {
    heading: { en: "Visit Us", hi: "हमसे मिलें" },
    address: {
      en: "Near Vanasthali Public School, Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012",
      hi: "वनस्थली पब्लिक स्कूल के पास, सेक्टर-3, वसुंधरा, गाजियाबाद, उत्तर प्रदेश 201012",
    },
    walkInNote: {
      en: "Currently order online or call ahead — not accepting walk-ins at the moment.",
      hi: "फिलहाल ऑनलाइन ऑर्डर करें या पहले कॉल करें — अभी वॉक-इन स्वीकार नहीं किए जा रहे।",
    },
  },
  call: { heading: { en: "Call Us", hi: "हमें कॉल करें" } },
  delivery: {
    heading: { en: "Local Delivery", hi: "लोकल डिलीवरी" },
    text: {
      en: "Delivery within 24 hours is available in selected Ghaziabad PIN codes in these areas, subject to product availability and order confirmation (orders confirmed later in the day may be delivered the following day):",
      hi: "इन इलाकों के चुनिंदा PIN कोड पर 24 घंटे के अंदर डिलीवरी की सुविधा उपलब्ध है — यह उत्पाद की उपलब्धता और ऑर्डर की पुष्टि पर निर्भर है (दिन में देर से कन्फर्म हुए ऑर्डर की डिलीवरी अगले दिन हो सकती है):",
    },
  },
  categoriesHeading: { en: "Shop by Category", hi: "श्रेणी के अनुसार खरीदें" },
  questions: {
    heading: { en: "Questions before you order?", hi: "ऑर्डर करने से पहले सवाल?" },
    text: {
      en: "We're happy to help with sizing, fabric care or bulk orders.",
      hi: "साइज़, फैब्रिक केयर या थोक ऑर्डर में मदद करके हमें खुशी होगी।",
    },
    cta: { en: "Get in touch", hi: "संपर्क करें", path: "/contact" },
  },
};

// Categories shown under "Shop by Category": the API already returns only
// active ones; this also drops anything inactive or without a slug/name so
// no link points at /category/undefined. api/render.js applies the same
// rule (render-ghaziabad-store.test.mjs G7 checks it with the same fixture).
export const listableCategories = (categories) =>
  (Array.isArray(categories) ? categories : []).filter(
    (c) => c && typeof c.slug === "string" && c.slug && c.name && c.isActive !== false,
  );

// GZ-05: the walk-in note while the shop is closed, null once it reopens.
export const walkInNote = (open) => (open ? null : GHAZIABAD_COPY.visit.walkInNote);

// English view of GHAZIABAD_COPY: every {en, hi} becomes its English string,
// or {text, path} for a link. This is exactly what api/render.js mirrors.
const pickEn = (v) => {
  if (Array.isArray(v)) return v.map(pickEn);
  if (v && typeof v === "object") {
    if ("en" in v && "hi" in v) return v.path ? { text: v.en, path: v.path } : v.en;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pickEn(x)]));
  }
  return v;
};
export const GHAZIABAD_COPY_EN = pickEn(GHAZIABAD_COPY);
