import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import { getCategories } from "../services/categoryService";
import { useLanguage } from "../context/LanguageContext";

function About() {
  const [categories, setCategories] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    const loadCategories = async () => {
      const response = await getCategories();

      if (response.success) setCategories(response.categories);
    };

    loadCategories();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-16 pb-20">
      <Seo
        title="About Mittal Collections — Home Furnishing Store, Pan-India Delivery"
        description="Mittal Collections is a home furnishing store offering premium bedsheets, towels, curtains, cushions and doormats with pan-India delivery — quality materials, fast 24-hour delivery in Ghaziabad, and easy returns."
        url="https://www.mittalcollections.com/about"
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        {t("About Mittal Collections", "मित्तल कलेक्शंस के बारे में")}
      </h1>

      <p className="text-slate-600 leading-relaxed mb-6">
        {t(
          "Mittal Collections is a home furnishing store built around a simple idea: everyday essentials for your home should feel premium without being complicated to shop for. We put together a focused range of bedsheets, towels, curtains, pillows, cushions and blankets, chosen for their materials and finish rather than sheer volume.",
          "मित्तल कलेक्शंस एक होम फर्निशिंग स्टोर है जो एक सरल विचार पर बना है: आपके घर की रोज़मर्रा की ज़रूरी चीज़ें प्रीमियम लगनी चाहिए, बिना खरीदारी को मुश्किल बनाए। हमने बेडशीट, तौलिए, पर्दे, तकिए, कुशन और कंबल की एक चुनी हुई रेंज तैयार की है, जिसे मात्रा की बजाय उनकी सामग्री और फिनिश के आधार पर चुना गया है।",
        )}
      </p>

      <p className="text-slate-600 leading-relaxed mb-10">
        {t(
          "Every order ships with secure packaging and doorstep delivery, and if something isn't right, our return process is straightforward — no runaround. We'd rather you trust one purchase enough to make a second.",
          "हर ऑर्डर सुरक्षित पैकेजिंग और घर तक डिलीवरी के साथ भेजा जाता है, और अगर कुछ सही नहीं लगे तो हमारी रिटर्न प्रक्रिया आसान है — कोई झंझट नहीं। हम चाहते हैं कि एक खरीदारी के बाद आप हम पर इतना भरोसा करें कि दोबारा खरीदारी करें।",
        )}
      </p>

      {categories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {t("What We Offer", "हम क्या पेश करते हैं")}
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

export default About;
