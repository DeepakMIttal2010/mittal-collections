import { imgUrl } from "../services/api";
import Seo from "../components/Seo";
import ProductDetailsSkeleton from "./ProductDetailsSkeleton";
import ProductReviews from "../components/ProductReviews";
import ProductQuestions from "../components/ProductQuestions";
import { getStockStatus } from "../utils/stock";
import { productUrl } from "../utils/productUrl";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import Breadcrumbs from "../components/Breadcrumbs";
import { subscribeStockAlert } from "../services/productService";
import { getProductQuestions } from "../services/questionService";
import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FaStar,
  FaShoppingCart,
  FaHeart,
  FaSearchPlus,
  FaSearchMinus,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaPlay,
  FaCheckCircle,
  FaEye,
  FaGift,
} from "react-icons/fa";
import {
  FaFacebookF,
  FaXTwitter,
  FaPinterestP,
  FaEnvelope,
  FaWhatsapp,
} from "react-icons/fa6";

import {
  getProductById,
  getProductsByCategory,
} from "../services/productService";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import ProductCard from "../components/ProductCard/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed/RecentlyViewed";
import { addRecentlyViewed } from "../utils/recentlyViewed";
import { getProductViewCount } from "../services/analyticsService";
import { getProductReviews } from "../services/reviewService";
import { getPublicRewardsInfo } from "../services/rewardsService";
import AutoCompareTable from "../components/AutoCompareTable";

function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [zoomStyle, setZoomStyle] = useState({});
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [viewCount, setViewCount] = useState(0);
  const [reviewStats, setReviewStats] = useState({
    averageRating: 0,
    totalReviews: 0,
  });

  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [earnRate, setEarnRate] = useState(null);
  const [faqItems, setFaqItems] = useState([]);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const relatedScrollRef = useRef(null);

  const { addToCart } = useCart();
  const { wishlistItems, addToWishlist, removeFromWishlist } = useWishlist();
  const { user, isLoggedIn } = useAuth();

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });
  }, []);

  useEffect(() => {
    if (user?.email) setNotifyEmail(user.email);
  }, [user]);

  useEffect(() => {
    getProductQuestions(id).then((response) => {
      if (response.success) setFaqItems(response.questions);
    });
  }, [id]);

  useEffect(() => {
    getSiteSettings().then((response) => {
      if (response.success && response.settings.phone) {
        setWhatsappPhone(response.settings.phone);
      }
    });
  }, []);

  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);
      setRelatedProducts([]);

      const response = await getProductById(id);

      if (response.success) {
        setProduct(response.product);
        addRecentlyViewed(response.product._id);

        getProductViewCount(response.product._id).then((viewRes) => {
          if (viewRes.success) setViewCount(viewRes.count);
        });

        getProductReviews(response.product._id).then((reviewRes) => {
          if (reviewRes.success) {
            setReviewStats({
              averageRating: reviewRes.averageRating,
              totalReviews: reviewRes.totalReviews,
            });
          }
        });

        const initialIndex = response.product.images?.indexOf(
          response.product.image,
        );
        setActiveMediaIndex(initialIndex >= 0 ? initialIndex : 0);

        const categoryId = response.product.category?._id;

        if (categoryId) {
          const relatedRes = await getProductsByCategory(categoryId);

          if (relatedRes.success) {
            setRelatedProducts(
              relatedRes.products.filter((p) => p._id !== id),
            );
          }
        }
      }

      setLoading(false);
    };

    loadProduct();
  }, [id]);

  const scrollRelated = (direction) => {
    if (!relatedScrollRef.current) return;

    relatedScrollRef.current.scrollBy({
      left: direction === "next" ? 320 : -320,
      behavior: "smooth",
    });
  };

  const THUMB_LIMIT = 5;

  const productImages = product?.images?.length
    ? product.images
    : [product?.image].filter(Boolean);
  const productVideos = product?.videos || [];

  const mediaItems = [
    ...productImages.map((url) => ({ type: "image", url })),
    ...productVideos.map((url) => ({ type: "video", url })),
  ];

  const activeMedia = mediaItems[activeMediaIndex] || mediaItems[0];
  const hasThumbnails = mediaItems.length > 1;

  const visibleThumbCount =
    mediaItems.length > THUMB_LIMIT ? THUMB_LIMIT - 1 : mediaItems.length;
  const visibleThumbs = mediaItems.slice(0, visibleThumbCount);
  const overflowCount = mediaItems.length - visibleThumbCount;

  const handleMouseMove = (e) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;

    setZoomStyle({
      transformOrigin: `${x}% ${y}%`,
      transform: "scale(2)",
    });
  };

  const handleMouseLeave = () => {
    setZoomStyle({ transform: "scale(1)" });
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
  };

  const handleBuyNow = () => {
    addToCart(product, quantity);
    navigate(isLoggedIn ? "/checkout" : "/login?redirect=/checkout");
  };

  const openLightboxAt = (index) => {
    setIsLightboxZoomed(false);
    setLightboxIndex(index);
  };

  const openLightbox = () => openLightboxAt(activeMediaIndex);

  const closeLightbox = () => {
    setIsLightboxZoomed(false);
    setLightboxIndex(null);
  };

  const showPrevImage = () => {
    setIsLightboxZoomed(false);
    setLightboxIndex(
      (prev) => (prev - 1 + mediaItems.length) % mediaItems.length,
    );
  };

  const showNextImage = () => {
    setIsLightboxZoomed(false);
    setLightboxIndex((prev) => (prev + 1) % mediaItems.length);
  };

  const toggleLightboxZoom = () => setIsLightboxZoomed((prev) => !prev);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") showPrevImage();
      if (e.key === "ArrowRight") showNextImage();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex]);

  const isWishlisted = product
    ? wishlistItems.some((item) => item._id === product._id)
    : false;

  const handleWishlistToggle = () => {
    if (isWishlisted) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(product);
    }
  };

  if (loading) {
    return <ProductDetailsSkeleton />;
  }

  if (!product) {
    return (
      <div className="p-16 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Product Not Found
        </h2>
        <Link to="/" className="text-blue-600 hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}${productUrl(product)}`;
  const shareText = product.name;
  const pointsPreview = earnRate
    ? Math.floor((product.price * quantity) / earnRate)
    : 0;

  const handleNotifySubmit = async (e) => {
    e.preventDefault();

    setNotifySending(true);
    const response = await subscribeStockAlert(product._id, notifyEmail);
    setNotifySending(false);

    if (response.success) {
      setNotifySubmitted(true);
    } else {
      alert(response.message || "Unable to subscribe");
    }
  };

  const shareLinks = [
    {
      label: "Facebook",
      icon: FaFacebookF,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: "X",
      icon: FaXTwitter,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      label: "Pinterest",
      icon: FaPinterestP,
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(imgUrl(product.image))}&description=${encodeURIComponent(shareText)}`,
    },
    {
      label: "Email",
      icon: FaEnvelope,
      href: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: "WhatsApp",
      icon: FaWhatsapp,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    },
  ];

  const discount =
    product.oldPrice > product.price
      ? Math.round(
          ((product.oldPrice - product.price) / product.oldPrice) * 100,
        )
      : 0;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: imgUrl(product.image),
    brand: {
      "@type": "Brand",
      name: "Mittal Collections",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: product.price,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: shareUrl,
    },
    ...(reviewStats.totalReviews > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: reviewStats.averageRating.toFixed(1),
        reviewCount: reviewStats.totalReviews,
      },
    }),
  };

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    ...(product.category
      ? [
          {
            name: product.category.name,
            path: `/category/${product.category.slug}`,
          },
        ]
      : []),
    ...(product.subcategory && product.category
      ? [
          {
            name: product.subcategory.name,
            path: `/category/${product.category.slug}/${product.subcategory.slug}`,
          },
        ]
      : []),
    { name: product.name },
  ];

  const specRows = [
    { label: "Fabric", value: product.fabric },
    { label: "Size", value: product.size },
    { label: "GSM", value: product.gsm },
    { label: "Wash Care", value: product.washCare },
    { label: "Brand", value: product.brand },
    { label: "Country of Origin", value: product.countryOfOrigin },
  ].filter((row) => row.value);

  const faqJsonLd = faqItems.length > 0 && {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Seo
        title={product.name}
        description={
          product.description
            ? product.description.slice(0, 160)
            : `Buy ${product.name} at Mittal Collections`
        }
        image={imgUrl(product.image)}
        url={shareUrl}
        jsonLd={[
          productJsonLd,
          buildBreadcrumbJsonLd(breadcrumbItems),
          faqJsonLd,
        ]}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image gallery with zoom */}
        <div
          className={`grid grid-cols-1 gap-3 ${
            hasThumbnails ? "sm:grid-cols-[2fr_1fr]" : ""
          }`}
        >
          <div>
            <div
              className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white aspect-square ${
                activeMedia?.type === "video" ? "" : "cursor-zoom-in"
              }`}
              onMouseMove={
                activeMedia?.type === "image" ? handleMouseMove : undefined
              }
              onMouseLeave={
                activeMedia?.type === "image" ? handleMouseLeave : undefined
              }
              onClick={
                activeMedia?.type === "image" ? openLightbox : undefined
              }
            >
              {activeMedia?.type === "video" ? (
                <video
                  key={activeMedia.url}
                  src={`${imgUrl(activeMedia.url)}`}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <img
                    src={`${imgUrl(activeMedia?.url)}`}
                    alt={product.name}
                    style={zoomStyle}
                    className="w-full h-full object-cover transition-transform duration-200 pointer-events-none"
                  />

                  <span className="absolute top-3 right-3 bg-white/90 text-slate-600 rounded-full p-2 shadow">
                    <FaSearchPlus className="text-sm" />
                  </span>
                </>
              )}

              {discount > 0 && (
                <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {discount}% OFF
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={openLightbox}
              className="w-full text-center text-sm text-blue-600 hover:underline mt-2"
            >
              Click to see full view
            </button>
          </div>

          {hasThumbnails && (
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-3">
              {visibleThumbs.map((item, index) => {
                const isOverflowTile =
                  index === visibleThumbCount - 1 && overflowCount > 0;

                return (
                  <button
                    key={`${item.url}-${index}`}
                    type="button"
                    onClick={() =>
                      isOverflowTile
                        ? openLightboxAt(visibleThumbCount)
                        : setActiveMediaIndex(index)
                    }
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                      index === activeMediaIndex
                        ? "border-blue-600"
                        : "border-slate-200 hover:border-amber-400"
                    }`}
                  >
                    {item.type === "video" ? (
                      <video
                        src={`${imgUrl(item.url)}`}
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={`${imgUrl(item.url)}`}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    )}

                    {item.type === "video" && !isOverflowTile && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <FaPlay className="text-white text-sm drop-shadow" />
                      </span>
                    )}

                    {isOverflowTile && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-semibold">
                        +{overflowCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-sm text-slate-500 mb-1">
            {product.category?.name}
            {product.subcategory?.name ? ` / ${product.subcategory.name}` : ""}
          </p>

          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            {product.name}
          </h1>

          <p className="text-xs text-slate-400 mb-3 font-mono">
            Product ID: {product._id}
          </p>

          <div className="flex items-center gap-1 text-amber-500 mb-4">
            <FaStar />
            <span className="text-slate-700 text-sm">{product.rating}</span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-bold text-slate-900">
              ₹{product.price}
            </span>
            {product.oldPrice > product.price && (
              <span className="text-lg text-slate-400 line-through">
                ₹{product.oldPrice}
              </span>
            )}
          </div>

          {pointsPreview > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-amber-700 mb-4">
              <FaGift className="text-amber-500" />
              You&apos;ll earn {pointsPreview} loyalty points on this order
            </p>
          )}

          <p
            className={`text-sm font-semibold ${
              viewCount > 0 ? "mb-2" : "mb-4"
            } ${getStockStatus(product.stock).className}`}
          >
            {getStockStatus(product.stock).label}
          </p>

          {viewCount > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
              <FaEye className="text-slate-400" />
              {viewCount} {viewCount === 1 ? "person" : "people"} viewed this
              today
            </p>
          )}

          {product.stock <= 0 &&
            (notifySubmitted ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
                We&apos;ll email you when this is back in stock.
              </p>
            ) : (
              <form
                onSubmit={handleNotifySubmit}
                className="flex gap-2 mb-6"
              >
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="Your email"
                  required
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={notifySending}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium disabled:opacity-60"
                >
                  {notifySending ? "..." : "Notify Me"}
                </button>
              </form>
            ))}

          <p className="text-slate-600 leading-relaxed mb-6">
            {product.description}
          </p>

          {specRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-6">
              {specRows.map((row) => (
                <div
                  key={row.label}
                  className="flex px-4 py-2.5 text-sm gap-4"
                >
                  <span className="w-36 shrink-0 text-slate-500">
                    {row.label}
                  </span>
                  <span className="text-slate-800 font-medium">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm font-medium text-slate-700">Qty:</span>
            <div className="flex items-center border border-slate-300 rounded-lg">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(q - 1, 1))}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                −
              </button>
              <span className="px-4 py-1.5 border-x border-slate-300">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  setQuantity((q) => Math.min(q + 1, product.stock || q + 1))
                }
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <button
              onClick={handleAddToCart}
              disabled={product.stock <= 0}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaShoppingCart />
              Add to Cart — ₹{product.price * quantity}
            </button>

            <button
              onClick={handleWishlistToggle}
              aria-label="Toggle wishlist"
              className={`w-12 h-12 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                isWishlisted
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FaHeart />
            </button>
          </div>

          <button
            onClick={handleBuyNow}
            disabled={product.stock <= 0}
            className="w-full border-2 border-blue-900 text-blue-900 font-semibold rounded-full px-6 py-3 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Buy it now
          </button>

          {whatsappPhone &&
            (product.stock <= 0 ? (
              <button
                type="button"
                disabled
                className="flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-400 font-semibold rounded-full px-6 py-3 mt-3 cursor-not-allowed"
              >
                <FaWhatsapp />
                Order on WhatsApp
              </button>
            ) : (
              <a
                href={`https://wa.me/${toWhatsAppNumber(whatsappPhone)}?text=${encodeURIComponent(
                  `Hi, I want to order this product:\n${product.name} (₹${product.price})\n${shareUrl}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold rounded-full px-6 py-3 mt-3 transition-colors"
              >
                <FaWhatsapp />
                Order on WhatsApp
              </a>
            ))}

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-6 pt-6 border-t border-slate-200">
            {[
              "100% Genuine Product",
              "Secure Payment",
              "Fast Delivery",
              "Easy Return",
              "Cash on Delivery Available",
            ].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 text-sm text-slate-600"
              >
                <FaCheckCircle className="text-green-600 shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-6">
            <span className="text-sm font-medium text-slate-700">
              Share:
            </span>
            {shareLinks.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                {...(label !== "Email" && {
                  target: "_blank",
                  rel: "noopener noreferrer",
                })}
                aria-label={`Share on ${label}`}
                className="w-9 h-9 rounded-full bg-slate-900 hover:bg-amber-500 text-white flex items-center justify-center transition-colors"
              >
                <Icon className="text-sm" />
              </a>
            ))}
          </div>

          <Link
            to="/"
            className="inline-block mt-6 text-sm text-blue-700 hover:underline"
          >
            ← Continue Shopping
          </Link>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-slate-900">
              You may also like
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollRelated("prev")}
                aria-label="Previous products"
                className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <FaChevronLeft className="text-xs" />
              </button>
              <button
                type="button"
                onClick={() => scrollRelated("next")}
                aria-label="Next products"
                className="w-9 h-9 rounded-full border border-blue-900 text-blue-900 hover:bg-blue-50 flex items-center justify-center"
              >
                <FaChevronRight className="text-xs" />
              </button>
            </div>
          </div>

          <div
            ref={relatedScrollRef}
            className="flex gap-5 overflow-x-auto scroll-smooth pb-2"
          >
            {relatedProducts.map((relatedProduct) => (
              <div key={relatedProduct._id} className="w-64 shrink-0">
                <ProductCard product={relatedProduct} />
              </div>
            ))}
          </div>
        </div>
      )}

      <AutoCompareTable
        mainProduct={product}
        similarProducts={relatedProducts.slice(0, 3)}
      />

      <ProductReviews productId={id} />
      <ProductQuestions productId={id} />

      <RecentlyViewed excludeId={id} />

      {lightboxIndex !== null && (
        <div
          onClick={closeLightbox}
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
        >
          <span className="absolute top-6 left-6 text-white/80 text-sm font-medium">
            {lightboxIndex + 1} / {mediaItems.length}
          </span>

          {mediaItems[lightboxIndex]?.type === "image" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLightboxZoom();
              }}
              aria-label={isLightboxZoomed ? "Zoom out" : "Zoom in"}
              className="absolute top-6 right-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              {isLightboxZoomed ? <FaSearchMinus /> : <FaSearchPlus />}
            </button>
          )}

          <button
            onClick={closeLightbox}
            aria-label="Close"
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <FaTimes />
          </button>

          {mediaItems.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showPrevImage();
              }}
              aria-label="Previous"
              className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <FaChevronLeft />
            </button>
          )}

          {mediaItems[lightboxIndex]?.type === "video" ? (
            <video
              key={mediaItems[lightboxIndex].url}
              src={`${imgUrl(mediaItems[lightboxIndex].url)}`}
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[85vh]"
            />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className={
                isLightboxZoomed
                  ? "max-w-[92vw] max-h-[85vh] overflow-auto"
                  : "max-w-full max-h-[85vh]"
              }
            >
              <img
                src={`${imgUrl(mediaItems[lightboxIndex]?.url)}`}
                alt={product.name}
                onClick={toggleLightboxZoom}
                className={
                  isLightboxZoomed
                    ? "max-w-none cursor-zoom-out"
                    : "max-w-full max-h-[85vh] object-contain cursor-zoom-in"
                }
              />
            </div>
          )}

          {mediaItems.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showNextImage();
              }}
              aria-label="Next"
              className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <FaChevronRight />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductDetails;
