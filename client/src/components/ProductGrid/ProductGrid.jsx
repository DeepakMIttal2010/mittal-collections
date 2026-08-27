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
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  );
}

export default ProductGrid;
