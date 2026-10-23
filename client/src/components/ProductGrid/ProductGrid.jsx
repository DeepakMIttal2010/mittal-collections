import "./ProductGrid.css";
import ProductCard from "../ProductCard/ProductCard";
import { useLanguage } from "../../context/LanguageContext";

// priorityCount: how many leading cards load eagerly at high priority.
// 4 = the first row on a listing page; pass 0 for a grid that sits below
// the fold (the homepage's New Arrivals sections), where eager cards only
// compete with the hero photo for bandwidth.
function ProductGrid({ products = [], priorityCount = 4 }) {
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
        <ProductCard key={product._id} product={product} priority={index < priorityCount} />
      ))}
    </div>
  );
}

export default ProductGrid;
