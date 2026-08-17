import { useEffect, useState } from "react";

import { getNewArrivalProducts } from "../../services/productService";
import ProductGrid from "../ProductGrid/ProductGrid";
import ProductGridSkeleton from "../ProductGrid/ProductGridSkeleton";
import { useLanguage } from "../../context/LanguageContext";

const ARRIVALS_COUNT = 8;

function NewArrivals() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    getNewArrivalProducts(ARRIVALS_COUNT).then((response) => {
      if (response.success) {
        setProducts(response.products);
      }

      setLoading(false);
    });
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-2">
          {t("New Arrivals", "नए प्रोडक्ट्स")}
        </h2>
        <p className="text-slate-500 text-center mb-10">
          {t(
            "Fresh additions to our collection, just for you.",
            "आपके लिए हमारे कलेक्शन में नए जुड़े प्रोडक्ट्स।",
          )}
        </p>

        {loading ? (
          <ProductGridSkeleton />
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </section>
  );
}

export default NewArrivals;
