import "./ProductGrid.css";
import ProductCard from "../ProductCard/ProductCard";
import { useLanguage } from "../../context/LanguageContext";

function ProductGrid({ products = [] }) {
  const { t } = useLanguage();

  if (!products.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <h3>{t("No products found.", "कोई प्रोडक्ट नहीं मिला।")}</h3>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product, index) => (
        // First 4 cards = above the fold on every real breakpoint this
        // grid uses (2 cols mobile, more on desktop) -- see
        // ProductCard.jsx's own comment for why this matters for LCP.
        <ProductCard key={product._id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

export default ProductGrid;
