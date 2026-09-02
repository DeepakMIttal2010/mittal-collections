import { imgUrl } from "../../services/api";
import { Link } from "react-router-dom";
import { FaTimes } from "react-icons/fa";

function ProductQuickView({ product, onClose }) {
  const images = product.images?.length ? product.images : [product.image];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden relative grid grid-cols-1 sm:grid-cols-2 grid-rows-[minmax(0,1fr)]"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-600 flex items-center justify-center shadow"
        >
          <FaTimes />
        </button>

        <div className="bg-slate-50 p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
          {images[0] ? (
            <img
              src={`${imgUrl(images[0])}`}
              alt={product.name}
              className="w-full aspect-square object-cover rounded-lg border border-slate-200"
            />
          ) : (
            <div className="w-full aspect-square flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 text-sm font-medium">
              No Image
            </div>
          )}

          {images.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {images.slice(1).map((img) => (
                <img
                  key={img}
                  src={`${imgUrl(img)}`}
                  alt={product.name}
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col min-h-0">
          <div className="p-6 pb-4 overflow-y-auto min-h-0 flex-1">
            <span
              className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-3 ${
                product.isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {product.isActive ? "Active" : "Inactive"}
            </span>

            {product.featured && (
              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 mb-3 ml-2">
                Featured
              </span>
            )}

            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {product.name}
            </h2>

            <p className="text-sm text-slate-500 mb-4">
              {product.category?.name || "Uncategorized"}
              {product.subcategories?.length
                ? ` / ${product.subcategories.map((sub) => sub.name).join(", ")}`
                : ""}
            </p>

            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl font-bold text-slate-900">
                ₹{product.price}
              </span>
              {product.oldPrice > product.price && (
                <span className="text-slate-400 line-through">
                  ₹{product.oldPrice}
                </span>
              )}
            </div>

            <p
              className={`text-sm font-medium mb-4 ${
                product.stock > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              Stock: {product.stock}
            </p>

            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 shrink-0">
            <Link
              to={`/admin/products/edit/${product._id}`}
              onClick={onClose}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Edit Product
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductQuickView;
