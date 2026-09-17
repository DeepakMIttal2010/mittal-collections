import { imgUrl, imgSrcSet } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories } from "../../services/categoryService";
import Skeleton from "../Skeleton";
import { useLanguage } from "../../context/LanguageContext";

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const loadCategories = async () => {
    try {
      const response = await getCategories();

      if (response.success) {
        setCategories(response.categories);
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  return (
    <section className="py-20 bg-white" id="shop-categories">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            {t("Shop Home Furnishing Online", "होम फर्निशिंग ऑनलाइन खरीदें")}
          </h2>

          {/* Real, readable body copy naming the actual categories — not
              just the visual cards below, which carry names/images but no
              crawlable sentence tying them together. Google recommends
              exactly this for ecommerce sites: on-page text + internal
              links that make a site's category/topical structure explicit,
              not just navigation. Built from the live category list, so it
              can never drift out of sync with what's actually sold. */}
          {categories.length > 0 && (
            <>
              <p className="text-slate-600 leading-relaxed">
                {t(
                  `Mittal Collections offers home furnishing products online, including ${categories.map((c) => c.name).join(", ")}, and other home decor essentials — with delivery across India and same-day express delivery in Ghaziabad.`,
                  `मित्तल कलेक्शंस ऑनलाइन होम फर्निशिंग उत्पाद उपलब्ध कराता है, जिनमें ${categories.map((c) => t(c.name, c.nameHi)).join(", ")} और अन्य होम डेकोर सामान शामिल हैं — पूरे भारत में डिलीवरी के साथ, और गाज़ियाबाद में उसी दिन एक्सप्रेस डिलीवरी।`,
                )}
              </p>

              <p className="text-sm text-slate-500 mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {categories.map((c, i) => (
                  <span key={c._id} className="flex items-center gap-2">
                    <Link to={`/category/${c.slug}`} className="hover:text-amber-600 underline underline-offset-2">
                      {t(c.name, c.nameHi)}
                    </Link>
                    {i < categories.length - 1 && <span className="text-slate-300">|</span>}
                  </span>
                ))}
              </p>
            </>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="group block rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100 hover:shadow-xl transition-shadow duration-300"
              >
                <div className="relative h-72 overflow-hidden">
                  <img
                    src={`${imgUrl(category.image, "w_600,q_auto,f_auto")}`}
                    srcSet={imgSrcSet(category.image, [400, 600, 850])}
                    sizes="(min-width: 1024px) 405px, (min-width: 640px) 45vw, 90vw"
                    alt={t(category.name, category.nameHi)}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <h3 className="text-xl font-semibold mb-1">
                      {t(category.name, category.nameHi)}
                    </h3>

                    {category.description && (
                      <p className="text-sm text-white/80 line-clamp-1">
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Categories;
