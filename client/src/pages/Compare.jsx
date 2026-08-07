import { Link } from "react-router-dom";
import { FaTimes, FaShoppingCart, FaStar } from "react-icons/fa";

import { useCompare } from "../context/CompareContext";
import { useCart } from "../context/CartContext";
import { imgUrl } from "../services/api";
import { productUrl } from "../utils/productUrl";
import { getStockStatus } from "../utils/stock";
import Seo from "../components/Seo";

const ROWS = [
  { label: "Price", render: (p) => `₹${p.price}` },
  {
    label: "MRP",
    render: (p) =>
      p.oldPrice > p.price ? (
        <span className="line-through text-slate-400">₹{p.oldPrice}</span>
      ) : (
        "—"
      ),
  },
  {
    label: "Rating",
    render: (p) => (
      <span className="flex items-center gap-1">
        <FaStar className="text-amber-500 text-xs" /> {p.rating}
      </span>
    ),
  },
  { label: "Category", render: (p) => p.category?.name || "—" },
  {
    label: "Availability",
    render: (p) => (
      <span className={getStockStatus(p.stock).className}>
        {getStockStatus(p.stock).label}
      </span>
    ),
  },
  {
    label: "Description",
    render: (p) => (
      <span className="line-clamp-4 text-left">{p.description}</span>
    ),
  },
];

function Compare() {
  const { compareItems, removeFromCompare, clearCompare } = useCompare();
  const { addToCart } = useCart();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Seo
        title="Compare Products"
        description="Compare bedsheets, curtains, towels and more side by side before you buy."
      />

      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          Compare Products
        </h1>

        {compareItems.length > 0 && (
          <button
            type="button"
            onClick={clearCompare}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {compareItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 mb-4">
            You haven&apos;t added any products to compare yet.
          </p>
          <Link
            to="/"
            className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
          >
            Continue Shopping
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
                        aria-label={`Remove ${product.name}`}
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
                        onClick={() => addToCart(product)}
                        disabled={product.stock <= 0}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold rounded-full py-2 transition-colors disabled:opacity-50"
                      >
                        <FaShoppingCart className="text-[10px]" />
                        Add to Cart
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map((row) => (
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
