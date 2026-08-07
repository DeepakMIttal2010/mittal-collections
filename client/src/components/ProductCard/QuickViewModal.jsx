import { imgUrl } from "../../services/api";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FaTimes,
  FaStar,
  FaShoppingCart,
  FaHeart,
  FaGift,
  FaExchangeAlt,
} from "react-icons/fa";

import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useCompare } from "../../context/CompareContext";
import { getStockStatus } from "../../utils/stock";
import { productUrl } from "../../utils/productUrl";
import { getEarnRate } from "../../services/rewardsService";

function QuickViewModal({ product, onClose }) {
  const { addToCart } = useCart();
  const { wishlistItems, addToWishlist, removeFromWishlist } = useWishlist();
  const { toggleCompare, isInCompare } = useCompare();
  const [earnRate, setEarnRate] = useState(null);
  const inCompare = isInCompare(product._id);

  useEffect(() => {
    getEarnRate().then(setEarnRate);
  }, []);

  const pointsPreview = earnRate ? Math.floor(product.price / earnRate) : 0;

  const isWishlisted = wishlistItems.some((item) => item._id === product._id);

  const handleWishlistToggle = () => {
    if (isWishlisted) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(product);
    }
  };

  const discount =
    product.oldPrice > product.price
      ? Math.round(
          ((product.oldPrice - product.price) / product.oldPrice) * 100,
        )
      : 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden relative grid grid-cols-1 sm:grid-cols-2"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-600 flex items-center justify-center shadow"
        >
          <FaTimes />
        </button>

        <div className="relative">
          <img
            src={`${imgUrl(product.image)}`}
            alt={product.name}
            className="w-full h-full object-cover"
          />

          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {discount}% OFF
            </span>
          )}
        </div>

        <div className="p-6 flex flex-col">
          <p className="text-sm text-slate-500 mb-1">
            {product.category?.name}
          </p>

          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {product.name}
          </h2>

          <div className="flex items-center gap-1 text-amber-500 mb-3">
            <FaStar className="text-sm" />
            <span className="text-slate-700 text-sm">{product.rating}</span>
          </div>

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

          {pointsPreview > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 mb-3">
              <FaGift />
              Earn {pointsPreview} loyalty points
            </p>
          )}

          <p
            className={`text-sm font-semibold mb-3 ${
              getStockStatus(product.stock).className
            }`}
          >
            {getStockStatus(product.stock).label}
          </p>

          <p className="text-sm text-slate-600 leading-relaxed mb-6 line-clamp-4">
            {product.description}
          </p>

          <div className="mt-auto flex gap-2">
            <button
              onClick={() => addToCart(product)}
              disabled={product.stock <= 0}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaShoppingCart className="text-sm" />
              Add to Cart
            </button>

            <button
              onClick={handleWishlistToggle}
              aria-label="Toggle wishlist"
              className={`w-11 h-11 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                isWishlisted
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FaHeart />
            </button>

            <button
              onClick={() => toggleCompare(product)}
              aria-label="Toggle compare"
              className={`w-11 h-11 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                inCompare
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FaExchangeAlt />
            </button>
          </div>

          <Link
            to={productUrl(product)}
            onClick={onClose}
            className="text-center text-sm text-blue-700 hover:underline mt-4"
          >
            View Full Details →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default QuickViewModal;
