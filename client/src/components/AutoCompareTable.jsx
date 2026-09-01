import { Link } from "react-router-dom";
import { FaShoppingCart } from "react-icons/fa";

import { imgUrl } from "../services/api";
import { productUrl } from "../utils/productUrl";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";

function getSpecRows(t) {
  return [
    { label: t("Price", "कीमत"), get: (p) => `₹${p.price}` },
    { label: t("Fabric", "फैब्रिक"), get: (p) => p.fabric },
    { label: t("Size", "साइज़"), get: (p) => p.size },
    { label: t("GSM", "GSM"), get: (p) => p.gsm },
    { label: t("Wash Care", "वॉश केयर"), get: (p) => p.washCare },
    { label: t("Brand", "ब्रांड"), get: (p) => p.brand },
    { label: t("Country of Origin", "मूल देश"), get: (p) => p.countryOfOrigin },
  ];
}

// Auto-compares the current product against a few similar products from
// the same category — no user selection needed, unlike the manual
// Compare Products feature. Rows only appear if at least one of the
// compared products actually has a value for it.
function AutoCompareTable({ mainProduct, similarProducts }) {
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const products = [mainProduct, ...similarProducts];

  const specRows = getSpecRows(t);
  const visibleRows = specRows.filter((row) =>
    products.some((p) => row.get(p)),
  );

  if (similarProducts.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="text-3xl font-bold text-slate-900 mb-2">
        {t("Compare with similar products", "समान प्रोडक्ट से तुलना करें")}
      </h2>
      <p className="text-slate-500 mb-6">
        {t(
          "See how this product stacks up against similar items in the same category.",
          "देखें कि यह प्रोडक्ट उसी श्रेणी के समान आइटम की तुलना में कैसा है।",
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="w-40" />
              {products.map((product, index) => (
                <th key={product._id} className="p-3 align-top text-left">
                  <div
                    className={`relative w-full max-w-[170px] ${
                      index === 0
                        ? "rounded-lg ring-2 ring-blue-900 p-2 -m-2"
                        : ""
                    }`}
                  >
                    {index === 0 && (
                      <span className="inline-block mb-1 text-[11px] font-bold text-blue-900">
                        {t("THIS PRODUCT", "यह प्रोडक्ट")}
                      </span>
                    )}
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
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="p-3 text-sm font-medium text-slate-500 align-top whitespace-nowrap">
                  {row.label}
                </td>
                {products.map((product) => (
                  <td
                    key={product._id}
                    className="p-3 text-sm text-slate-700 align-top"
                  >
                    {row.get(product) || (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-slate-100">
              <td className="p-3" />
              {products.map((product) => (
                <td key={product._id} className="p-3 align-top">
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    className="w-full max-w-[170px] flex items-center justify-center gap-1.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold rounded-full py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaShoppingCart className="text-[10px]" />
                    {t("Add to Cart", "कार्ट में डालें")}
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default AutoCompareTable;
