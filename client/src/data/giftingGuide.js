// "Choosing a Home Furnishing Gift" guide shown under the /gifting product
// grid (GiftingPage.jsx). Owner-approved English copy (2026-11-17); Hindi
// is its translation. Plain data, no JSX, so tests can import it.
//
// api/render.js keeps a hand-made copy of the English text for bots
// (render.js can't import client ESM) -- scripts/render-gifting.test.mjs
// fails if the two drift apart. Bots must get the same content visitors
// see, so never add text to only one side.
//
// Copy rules: the packaging line is owner-confirmed for every
// gifting-tagged product; delivery is UP-only (eligible PIN codes); no
// price, discount, material or delivery-time claims.

export const GIFT_BEDSHEET_PATH = "/category/bedsheets/gift-bedsheet";

export const GIFTING_GUIDE = {
  heading: {
    en: "Choosing a Home Furnishing Gift",
    hi: "होम फर्निशिंग गिफ्ट कैसे चुनें",
  },
  paragraphs: [
    {
      en: "Bedsheets, comforters and dohars make thoughtful gifts for everyday use. They are suitable choices for housewarmings (griha pravesh), weddings and festive occasions. Every product in our gifting collection ships in gift-box or book-fold packaging, so it is ready to gift without separate wrapping.",
      hi: "बेडशीट, कम्फर्टर और दोहर रोज़ इस्तेमाल के लिए सोच-समझकर दिए जाने वाले तोहफ़े हैं। ये गृह प्रवेश, शादी और त्योहारों के लिए अच्छे विकल्प हैं। हमारे गिफ्टिंग कलेक्शन का हर प्रोडक्ट गिफ्ट-बॉक्स या बुक-फोल्ड पैकेजिंग में भेजा जाता है, इसलिए अलग से रैपिंग की ज़रूरत नहीं पड़ती।",
    },
    {
      en: "A bedsheet set can be a practical choice for a couple or a new home. Comforters and dohars are useful options for seasonal gifting. When choosing a design, consider the recipient's room colours and personal preferences.",
      hi: "किसी कपल या नए घर के लिए बेडशीट सेट एक व्यावहारिक विकल्प हो सकता है। मौसम के हिसाब से तोहफ़े के लिए कम्फर्टर और दोहर उपयोगी विकल्प हैं। डिज़ाइन चुनते समय तोहफ़ा पाने वाले के कमरे के रंग और उनकी पसंद का ध्यान रखें।",
    },
  ],
  // Rendered as: before + <a>linkText</a> + after
  link: {
    before: {
      en: "Looking specifically for gift-ready bedsheet sets? Explore our ",
      hi: "ख़ास तौर पर गिफ्ट के लिए तैयार बेडशीट सेट चाहिए? हमारा ",
    },
    text: { en: "Gift Bedsheets", hi: "गिफ्ट बेडशीट" },
    after: { en: " collection.", hi: " कलेक्शन देखें।" },
  },
  delivery: {
    en: "Delivery is currently available to eligible PIN codes in Uttar Pradesh. Please check your PIN code before placing an order. For bulk or corporate gifting enquiries, contact us on WhatsApp.",
    hi: "डिलीवरी फ़िलहाल उत्तर प्रदेश के योग्य PIN कोड पर उपलब्ध है। ऑर्डर करने से पहले अपना PIN कोड ज़रूर जांचें। बल्क या कॉर्पोरेट गिफ्टिंग से जुड़ी पूछताछ के लिए हमसे WhatsApp पर संपर्क करें।",
  },
};
