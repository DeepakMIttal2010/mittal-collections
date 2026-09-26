import { imgUrl, imgSrcSet } from "../../services/api";
import { lazy, Suspense, useEffect, useState } from "react";
import "./ProductCard.css";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaGift,
  FaHeart,
  FaRegHeart,
  FaEye,
  FaShoppingCart,
  FaExchangeAlt,
  FaStar,
} from "react-icons/fa";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useCompare } from "../../context/CompareContext";
import { LOW_STOCK_THRESHOLD, getStockStatus } from "../../utils/stock";
import { productUrl } from "../../utils/productUrl";
import { handleImageError } from "../../utils/imageFallback";
import { getEarnRate } from "../../services/rewardsService";
import { useLanguage } from "../../context/LanguageContext";

// Lazy-loaded, not a static import: QuickViewModal (and the DOMPurify it
// pulls in via stripHtml.js) only ever renders after a click, but
// ProductCard itself is on every homepage/listing page — a static import
// here made Vite eagerly preload that whole chunk (DOMPurify included) on
// pages that never open the modal, which is what caused the real
// PageSpeed regression this was found from (homepage TBT jumped from
// ~40ms to ~900ms).
const QuickViewModal = lazy(() => import("./QuickViewModal"));

function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { wishlistItems, addToWishlist, removeFromWishlist } = useWishlist();
  const { toggleCompare, isInCompare } = useCompare();
  const { t } = useLanguage();
  const [showQuickView, setShowQuickView] = useState(false);
  const inCompare = isInCompare(product._id);
  const isWishlisted = wishlistItems.some((item) => item._id === product._id);
  const [earnRate, setEarnRate] = useState(null);
  // oldPrice defaults to 0 for a product an admin never set one for —
  // unguarded, (0-price)/0*100 renders as a literal "-Infinity% OFF"
  // badge. Only a real, positive discount counts (matches QuickViewModal
  // and AdminProducts' own guard for the same calculation).
  const hasDiscount = product.oldPrice > product.price;
  const discount = hasDiscount
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;
  const isLowStock = product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;
  const isOutOfStock = product.stock <= 0;
  const pointsPreview = earnRate ? Math.floor(product.price / earnRate) : 0;

  useEffect(() => {
    getEarnRate().then(setEarnRate);
  }, []);

  return (
    <div className="product-card">
      <Link to={productUrl(product)} className="product-link">
        <div className="product-image">
          <img
            src={`${imgUrl(product.image, "w_400,q_auto,f_auto")}`}
            srcSet={imgSrcSet(product.image, [200, 400, 600])}
            sizes="(min-width: 1024px) 270px, (min-width: 768px) 29vw, 45vw"
            alt={t(product.name, product.nameHi)}
            loading="lazy"
            onError={handleImageError}
          />

          {hasDiscount && (
            <span className="discount-badge">{t(`${discount}% OFF`, `${discount}% छूट`)}</span>
          )}

          {isOutOfStock ? (
            <span className="stock-badge out-of-stock-badge">
              {getStockStatus(product.stock).label}
            </span>
          ) : (
            isLowStock && (
              <span
                className={`stock-badge ${product.stock === 1 ? "exclusive-badge" : ""}`}
              >
                {product.stock === 1
                  ? t("Exclusive Piece", "एक्सक्लूसिव पीस")
                  : t(`Only ${product.stock} left!`, `सिर्फ़ ${product.stock} बचे हैं!`)}
              </span>
            )
          )}

          {/* Only the heart stays on the photo at all times (the Flipkart/
              Myntra pattern) -- three always-visible 44px buttons were
              covering a real chunk of the product photo on touch devices,
              and real photos are this site's main selling point. */}
          <button
            type="button"
            className={`wishlist-btn ${isWishlisted ? "active" : ""}`}
            aria-label={
              isWishlisted
                ? t("Remove from wishlist", "विशलिस्ट से हटाएं")
                : t("Add to wishlist", "विशलिस्ट में डालें")
            }
            aria-pressed={isWishlisted}
            onClick={(e) => {
              e.preventDefault();
              if (isWishlisted) removeFromWishlist(product._id);
              else addToWishlist(product);
            }}
          >
            <span className="wishlist-btn-circle">
              {isWishlisted ? <FaHeart /> : <FaRegHeart />}
            </span>
          </button>

          <div className="product-icons">
            <button
              type="button"
              aria-label={t("Quick view", "क्विक व्यू")}
              onClick={(e) => {
                e.preventDefault();
                setShowQuickView(true);
              }}
            >
              <FaEye />
            </button>

            <button
              type="button"
              aria-label={t("Toggle compare", "तुलना टॉगल करें")}
              className={inCompare ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                toggleCompare(product);
              }}
            >
              <FaExchangeAlt />
            </button>
          </div>
        </div>

        <div className="product-info">
          <p className="category">{product.category?.name}</p>

          <h3>{t(product.name, product.nameHi)}</h3>

          {product.size && <p className="size-line">{product.size}</p>}

          {/* Same real-review source as the product detail page's rating
              line — Product.rating is a static default (5 for every
              product), never shown here, since that would look like every
              product has a perfect rating regardless of actual reviews. */}
          {product.totalReviews > 0 && (
            <p className="rating">
              <FaStar className="star" />
              {product.averageRating.toFixed(1)} ({product.totalReviews})
            </p>
          )}

          <div className="price">
            <span className="new-price">₹{product.price}</span>

            {hasDiscount && <span className="old-price">₹{product.oldPrice}</span>}
          </div>

          {pointsPreview > 0 && (
            <p className="points-preview">
              <FaGift />
              {t(`Earn ${pointsPreview} loyalty points`, `${pointsPreview} लॉयल्टी पॉइंट्स कमाएं`)}
            </p>
          )}
        </div>
      </Link>

      <div className="product-action">
        <button
          className="cart-btn"
          type="button"
          disabled={isOutOfStock}
          onClick={(e) => {
            e.preventDefault();

            // A variant product added with no size picked falls back to
            // CartContext's top-level product.price/stock, which only
            // ever mirrors the FIRST variant (Product.js's own schema
            // comment) — this silently added whatever size happened to
            // be first in the array, at that size's price, with no size
            // recorded on the cart line at all. Same guard
            // Wishlist.jsx's handleAddToCart already uses for the exact
            // same reason — send them to the product page to pick a
            // real size instead of guessing one.
            if (product.variants?.length > 0) {
              toast.info(
                t(
                  "Please select a size on the product page",
                  "प्रोडक्ट पेज पर साइज़ चुनें",
                ),
              );
              navigate(productUrl(product));
              return;
            }

            addToCart(product);
          }}
        >
          <FaShoppingCart />
          {isOutOfStock ? t("Out of Stock", "स्टॉक में नहीं") : t("Add to Cart", "कार्ट में डालें")}
        </button>
      </div>

      {showQuickView && (
        <Suspense fallback={null}>
          <QuickViewModal
            product={product}
            onClose={() => setShowQuickView(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ProductCard;
