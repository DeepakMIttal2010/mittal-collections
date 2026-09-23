import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaMapMarkerAlt, FaPhoneAlt, FaClock } from "react-icons/fa";

import Seo from "../components/Seo";
import { getSiteSettings } from "../services/settingsService";
import { getCategories } from "../services/categoryService";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { DELIVERY_AREAS } from "../utils/deliveryAreas";
import { SITE_URL } from "../utils/siteUrl";
import { useLanguage } from "../context/LanguageContext";

// A dedicated local-SEO landing page, separate from the product-focused
// category pages and the transactional Contact page -- targets searches
// like "home furnishing store in Ghaziabad" / "bedsheets near me" that
// neither of those pages is built to rank for (Deep SEO Round 5 flagged
// this as a real content gap; Round 6's local-Ghaziabad scope is what
// this page is meant to serve).
function GhaziabadStore() {
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    getSiteSettings().then((res) => {
      if (res.success) setSettings(res.settings);
    });
    getCategories().then((res) => {
      if (res.success) setCategories(res.categories);
    });
  }, []);

  // Same @id as Home.jsx/Contact.jsx's HomeGoodsStore block -- same
  // business entity, not a second one. Landmark folded into
  // streetAddress since that's the one concrete, specific detail this
  // page exists to surface (the admin-configured settings.address is a
  // plainer "Sector 3, Vasundhara..." with no landmark).
  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "HomeGoodsStore",
    "@id": `${SITE_URL}/#business`,
    name: "Mittal Collections",
    url: `${SITE_URL}/`,
    telephone: settings.phone || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Near Vanasthali Public School, Sector-3, Vasundhara",
      addressLocality: "Ghaziabad",
      addressRegion: "Uttar Pradesh",
      postalCode: "201012",
      addressCountry: "IN",
    },
    areaServed: [
      ...DELIVERY_AREAS.map((area) => ({
        "@type": "Place",
        name: `${area}, Ghaziabad`,
      })),
      { "@type": "City", name: "Ghaziabad" },
    ],
    sameAs: [settings.facebook, settings.instagram, settings.twitter].filter(
      Boolean,
    ),
  };

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Home Furnishing Store in Ghaziabad" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 pt-16 pb-20">
      <Seo
        title="Home Furnishing Store in Ghaziabad — Mittal Collections"
        description="Mittal Collections is a home furnishing store in Sector-3, Vasundhara, Ghaziabad, near Vanasthali Public School — bedsheets, curtains, towels & more with 24-hour local delivery across Vasundhara, Vaishali, Indirapuram and nearby areas."
        url={`${SITE_URL}/ghaziabad-home-furnishing-store`}
        jsonLd={[localBusinessJsonLd, buildBreadcrumbJsonLd(breadcrumbItems)]}
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        {t(
          "Home Furnishing Store in Ghaziabad",
          "ग़ाज़ियाबाद में होम फर्निशिंग स्टोर",
        )}
      </h1>

      <p className="text-amber-700 font-semibold mb-1">
        {t(
          "Shop online from home, from your nearby local store",
          "घर बैठे ऑनलाइन शॉपिंग करें अपने नज़दीकी स्टोर से",
        )}
      </p>

      <p className="text-slate-600 mb-4">
        {t(
          "The same trusted quality from our shop — now online, only at mittalcollections.com",
          "वही दुकान वाली क्वालिटी और भरोसा — अब सिर्फ mittalcollections.com पर ऑनलाइन",
        )}
      </p>

      <p className="text-slate-600 leading-relaxed mb-8">
        {t(
          "Mittal Collections is based in Sector-3, Vasundhara, Ghaziabad — a home furnishing store offering bedsheets, curtains, towels, cushions and doormats, with same-day local delivery across Ghaziabad and pan-India shipping everywhere else.",
          "मित्तल कलेक्शंस ग़ाज़ियाबाद के सेक्टर-3, वसुंधरा में स्थित एक होम फर्निशिंग स्टोर है — बेडशीट, पर्दे, तौलिए, कुशन और डोरमैट, ग़ाज़ियाबाद में उसी दिन डिलीवरी के साथ और बाकी जगहों पर पूरे भारत में शिपिंग।",
        )}
      </p>

      <ul className="space-y-3 mb-10 text-slate-700">
        <li className="flex gap-2">
          <span className="text-amber-600">✓</span>
          {t(
            "Real photos, real products — what you see is exactly what reaches your door, no surprises.",
            "असली फोटो, असली प्रोडक्ट — जो आप देखते हैं, वही आपके घर तक पहुंचता है, कोई सरप्राइज़ नहीं।",
          )}
        </li>
        <li className="flex gap-2">
          <span className="text-amber-600">✓</span>
          {t(
            "Trusted by Ghaziabad families since 2021, now serving customers across India.",
            "2021 से ग़ाज़ियाबाद के परिवारों का भरोसा, अब पूरे भारत में ग्राहकों की सेवा।",
          )}
        </li>
        <li className="flex gap-2">
          <span className="text-amber-600">✓</span>
          {t(
            "Easy, hassle-free returns if something isn't right — we stand behind every order.",
            "अगर कुछ सही न लगे तो आसान, बिना झंझट का रिटर्न — हर ऑर्डर पर हमारा भरोसा।",
          )}
        </li>
        <li className="flex gap-2">
          <span className="text-amber-600">✓</span>
          {t(
            "From Vasundhara to Vaishali, Indirapuram to Kaushambi — fast local delivery, right to your doorstep.",
            "वसुंधरा से वैशाली, इंदिरापुरम से कौशांबी तक — तेज़ लोकल डिलीवरी, सीधे आपके दरवाज़े तक।",
          )}
        </li>
        <li className="flex gap-2">
          <span className="text-amber-600">✓</span>
          {t(
            "Quality home furnishing, fair prices, and the same trust as our physical store — only at mittalcollections.com.",
            "क्वालिटी होम फर्निशिंग, सही कीमत, और हमारी असली दुकान जैसा भरोसा — सिर्फ mittalcollections.com पर।",
          )}
        </li>
      </ul>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10 space-y-4">
        <div className="flex items-start gap-3">
          <FaMapMarkerAlt className="text-amber-600 mt-1 shrink-0" />
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
              {t("Visit Us", "हमसे मिलें")}
            </h2>
            <p className="text-slate-700">
              {t(
                "Near Vanasthali Public School, Sector-3, Vasundhara, Ghaziabad, Uttar Pradesh 201012",
                "वनस्थली पब्लिक स्कूल के पास, सेक्टर-3, वसुंधरा, ग़ाज़ियाबाद, उत्तर प्रदेश 201012",
              )}
            </p>
          </div>
        </div>

        {settings.phone && (
          <div className="flex items-start gap-3">
            <FaPhoneAlt className="text-amber-600 mt-1 shrink-0" />
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
                {t("Call Us", "हमें कॉल करें")}
              </h2>
              <a href={`tel:${settings.phone}`} className="text-blue-700 hover:underline">
                {settings.phone}
              </a>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <FaClock className="text-amber-600 mt-1 shrink-0" />
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
              {t("Local Delivery", "लोकल डिलीवरी")}
            </h2>
            <p className="text-slate-700">
              {t(
                "24-hour delivery across Ghaziabad, including:",
                "ग़ाज़ियाबाद में 24 घंटे में डिलीवरी, इन इलाकों सहित:",
              )}
            </p>
            <p className="text-slate-600 text-sm mt-1">
              {DELIVERY_AREAS.join(", ")}
            </p>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {t("Shop by Category", "श्रेणी के अनुसार खरीदें")}
          </h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="border border-slate-300 rounded-full px-5 py-2 text-sm font-medium text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors"
              >
                {t(category.name, category.nameHi)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          {t("Questions before you order?", "ऑर्डर करने से पहले सवाल?")}
        </h2>
        <p className="text-slate-600 mb-4">
          {t(
            "We're happy to help with sizing, fabric care or bulk orders.",
            "साइज़, फैब्रिक केयर या थोक ऑर्डर में मदद करके हमें खुशी होगी।",
          )}
        </p>
        <Link
          to="/contact"
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
        >
          {t("Get in touch", "संपर्क करें")}
        </Link>
      </div>
    </div>
  );
}

export default GhaziabadStore;
