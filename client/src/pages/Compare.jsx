import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaTimes, FaShoppingCart } from "react-icons/fa";

import { useCompare } from "../context/CompareContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { imgUrl } from "../services/api";
import { productUrl } from "../utils/productUrl";
import { getStockStatus } from "../utils/stock";
import { stripHtml } from "../utils/stripHtml";
import Seo from "../components/Seo";

function getRows(t) {
  return [
    { label: t("Price", "कीमत"), render: (p) => `₹${p.price}`, spec: null },
    {
      label: t("MRP", "MRP"),
      render: (p) =>
        p.oldPrice > p.price ? (
          <span className="line-through text-slate-400">₹{p.oldPrice}</span>
        ) : (
          "—"
        ),
      spec: null,
    },
    // Same spec fields AutoCompareTable.jsx already shows on the product
    // page's auto-generated comparison — the dedicated Compare page
    // customers explicitly navigate to was missing exactly the fields
    // that actually differentiate similar products (which bedsheet is
    // thicker/what fabric/what size), showing only Price/MRP/Category/
    // Availability/Description.
    { label: t("Fabric", "फैब्रिक"), render: (p) => p.fabric || "—", spec: "fabric" },
    { label: t("Size", "साइज़"), render: (p) => p.size || "—", spec: "size" },
    { label: t("GSM", "GSM"), render: (p) => p.gsm || "—", spec: "gsm" },
    { label: t("Wash Care", "वॉश केयर"), render: (p) => p.washCare || "—", spec: "washCare" },
    { label: t("Brand", "ब्रांड"), render: (p) => p.brand || "—", spec: "brand" },
    {
      label: t("Country of Origin", "मूल देश"),
      render: (p) => p.countryOfOrigin || "—",
      spec: "countryOfOrigin",
    },
    { label: t("Category", "श्रेणी"), render: (p) => p.category?.name || "—", spec: null },
    {
      label: t("Availability", "उपलब्धता"),
      render: (p) => (
        <span className={getStockStatus(p.stock).className}>
          {getStockStatus(p.stock).label}
        </span>
      ),
      spec: null,
    },
    {
      label: t("Description", "विवरण"),
      render: (p) => (
        <span className="line-clamp-4 text-left">{stripHtml(p.description)}</span>
      ),
      spec: null,
    },
  ];
}

function Compare() {
  const { compareItems, removeFromCompare, clearCompare } = useCompare();
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Spec rows (fabric, size, GSM, etc.) only show if at least one
  // compared product actually has a value for that field — matches
  // AutoCompareTable.jsx's identical getSpecRows/visibleRows filtering,
  // so a row isn't a wall of "—" for a product type that spec doesn't
  // apply to.
  const rows = getRows(t).filter(
    (row) => !row.spec || compareItems.some((p) => p[row.spec]),
  );

  // Same guard as Wishlist.jsx's handleAddToCart — a product with size
  // variants can't be added directly here; CartContext falls back to the
  // top-level price/stock when no variant is given, which only ever
  // mirrors the FIRST size, silently charging whatever that size costs
  // and never reserving stock for the size the customer actually wants.
  const handleAddToCart = (product) => {
    if (product.variants?.length > 0) {
      toast.info(
        t("Please select a size on the product page", "प्रोडक्ट पेज पर साइज़ चुनें"),
      );
      navigate(productUrl(product));
      return;
    }

    addToCart(product);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* noindex — compareItems is entirely localStorage-driven (see
          CompareContext), so a first-time visitor or crawler always sees
          an empty "no products to compare" state with nothing unique to
          index. Same reasoning as PriceRangePage.jsx's noindex. */}
      <Seo
        title="Compare Products"
        description="Compare bedsheets, curtains, towels and more side by side before you buy."
        noindex
      />

      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          {t("Compare Products", "प्रोडक्ट की तुलना करें")}
        </h1>

        {compareItems.length > 0 && (
          <button
            type="button"
            onClick={clearCompare}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            {t("Clear all", "सभी हटाएं")}
          </button>
        )}
      </div>

      {compareItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 mb-4">
            {t("You haven't added any products to compare yet.", "आपने अभी तक तुलना के लिए कोई प्रोडक्ट नहीं जोड़ा है।")}
          </p>
          <Link
            to="/"
            className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
          >
            {t("Continue Shopping", "शॉपिंग जारी रखें")}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th className="w-32" />
                {compareItems.map((product) => (
                  <th key={product._id} className="p-3 align-top text-left">
                    <div className="relative w-full max-w-[180px]">
                      <button
                        type="button"
                        onClick={() => removeFromCompare(product._id)}
                        aria-label={t(`Remove ${product.name}`, `${product.name} हटाएं`)}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600"
                      >
                        <FaTimes className="text-xs" />
                      </button>

                      <Link to={productUrl(product)}>
                        <img
                          src={imgUrl(product.image)}
                          alt={product.name}
                          className="w-full aspect-square object-cover rounded-lg border border-slate-200 mb-2"
                        />
                        <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                          {product.name}
                        </p>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        disabled={product.stock <= 0}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold rounded-full py-2 transition-colors disabled:opacity-50"
                      >
                        <FaShoppingCart className="text-[10px]" />
                        {t("Add to Cart", "कार्ट में डालें")}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="p-3 text-sm font-medium text-slate-500 align-top whitespace-nowrap">
                    {row.label}
                  </td>
                  {compareItems.map((product) => (
                    <td
                      key={product._id}
                      className="p-3 text-sm text-slate-700 align-top"
                    >
                      {row.render(product)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Compare;
