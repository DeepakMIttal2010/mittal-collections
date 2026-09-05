import { imgUrl } from "../services/api";
import Seo from "../components/Seo";
import PincodeChecker from "../components/PincodeChecker";
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
  FaEye,
  FaGift,
  FaMoneyBillWave,
  FaUndoAlt,
  FaLock,
  FaMedal,
  FaBan,
  FaPalette,
  FaTruck,
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
import { useLanguage } from "../context/LanguageContext";

function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [product, setProduct] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [zoomStyle, setZoomStyle] = useState({});
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mainImageLoaded, setMainImageLoaded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [bundleProducts, setBundleProducts] = useState([]);
  const [bundleCategory, setBundleCategory] = useState(null);
  const [bundleDiscountPercent, setBundleDiscountPercent] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [reviewStats, setReviewStats] = useState({
    averageRating: 0,
    totalReviews: 0,
  });

  const [descExpanded, setDescExpanded] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [earnRate, setEarnRate] = useState(null);
  const [faqItems, setFaqItems] = useState([]);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [defaultReturnPeriodDays, setDefaultReturnPeriodDays] = useState(7);

  const relatedScrollRef = useRef(null);
  const bundleScrollRef = useRef(null);

  const { addToCart } = useCart();
  const { wishlistItems, addToWishlist, removeFromWishlist } = useWishlist();
  const { user, isLoggedIn } = useAuth();

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });
  }, []);

  // Product photos are progressive JPEGs — on a slow connection the
  // browser paints a blurry, low-detail first pass before the full
  // image resolves, which briefly looks broken. Hide the image behind
  // a plain placeholder until it's actually decoded, then reveal it.
  useEffect(() => {
    setMainImageLoaded(false);
  }, [activeMediaIndex, product?._id]);

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
      if (!response.success) return;

      if (response.settings.phone) setWhatsappPhone(response.settings.phone);
      if (response.settings.defaultReturnPeriodDays) {
        setDefaultReturnPeriodDays(response.settings.defaultReturnPeriodDays);
      }
    });
  }, []);

  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);
      setRelatedProducts([]);
      setBundleProducts([]);
      setBundleCategory(null);
      setBundleDiscountPercent(0);

      const response = await getProductById(id);

      // Only a confirmed 404 counts as "doesn't exist" — a transient
      // failure (cold-starting backend, network blip) must not render
      // the same not-found/noindex state, or a slow response to a
      // crawler silently tells Google to drop a real, live product.
      setLoadFailed(!response.success && !response.notFound);

      if (response.success) {
        setProduct(response.product);
        // Default to the first size, matching what the top-level
        // price/stock already reflect (see Product.js's variants field).
        setSelectedVariant(response.product.variants?.[0] || null);
        setQuantity(1);
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
          // Independent of each other — fetch together instead of
          // waterfalling, and only chain the bundle-partner fetch after
          // since it needs settingsRes's matched rule first.
          const [relatedRes, settingsRes] = await Promise.all([
            getProductsByCategory(categoryId),
            getSiteSettings(),
          ]);

          if (relatedRes.success) {
            setRelatedProducts(
              relatedRes.products.filter((p) => p._id !== id),
            );
          }

          const matchedRule = (settingsRes.settings?.bundleRules || [])
            .filter((rule) => rule.isActive)
            .find(
              (rule) =>
                rule.categoryA?._id === categoryId ||
                rule.categoryB?._id === categoryId,
            );

          if (matchedRule) {
            const partnerCategory =
              matchedRule.categoryA?._id === categoryId
                ? matchedRule.categoryB
                : matchedRule.categoryA;

            const bundleRes = await getProductsByCategory(
              partnerCategory._id,
            );

            if (bundleRes.success) {
              setBundleProducts(bundleRes.products.slice(0, 8));
              setBundleCategory(partnerCategory);
              setBundleDiscountPercent(matchedRule.discountPercent);
            }
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

  const scrollBundle = (direction) => {
    if (!bundleScrollRef.current) return;

    bundleScrollRef.current.scrollBy({
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

  // Touchscreens fire a synthetic mousemove on tap but never a matching
  // mouseleave, so the hover-zoom would set scale(2) once and never reset —
  // leaving the image permanently zoomed on whatever point was tapped.
  // Only wire the effect up for real pointer devices that support hover.
  const supportsHoverZoom =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

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
    addToCart(product, quantity, selectedVariant);
  };

  const handleBuyNow = () => {
    addToCart(product, quantity, selectedVariant);
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

  if (!product && loadFailed) {
    // A fetch failure, not a confirmed 404 — the product may well
    // exist, so this deliberately renders no <Seo noindex> at all
    // (see getProductById's comment). A real visitor gets a retry
    // instead of a permanent dead end.
    return (
      <div className="p-16 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          {t(
            "Something went wrong loading this product",
            "इस प्रोडक्ट को लोड करने में समस्या हुई",
          )}
        </h2>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-blue-600 hover:underline"
        >
          {t("Try again", "फिर से कोशिश करें")}
        </button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-16 text-center">
        <Seo title="Product Not Found" noindex />
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          {t("Product Not Found", "प्रोडक्ट नहीं मिला")}
        </h2>
        <Link to="/" className="text-blue-600 hover:underline">
          {t("Back to Home", "होम पर वापस जाएं")}
        </Link>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}${productUrl(product)}`;
  const shareText = product.name;
  const displayDescription = t(product.description, product.descriptionHi);

  // Size variants (e.g. Curtains sold as 7x4/9x4) each carry their own
  // price/MRP/stock — once a size is selected these override the
  // top-level product fields, which otherwise just mirror the first
  // variant as a sane pre-selection default (see Product.js).
  const hasVariants = product.variants?.length > 0;
  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayOldPrice = selectedVariant
    ? selectedVariant.oldPrice
    : product.oldPrice;
  const displayStock = selectedVariant ? selectedVariant.stock : product.stock;

  const pointsPreview = earnRate
    ? Math.floor((displayPrice * quantity) / earnRate)
    : 0;

  const handleNotifySubmit = async (e) => {
    e.preventDefault();

    setNotifySending(true);
    const response = await subscribeStockAlert(product._id, notifyEmail);
    setNotifySending(false);

    if (response.success) {
      setNotifySubmitted(true);
    } else {
      alert(response.message || t("Unable to subscribe", "सब्सक्राइब नहीं हो सका"));
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
    displayOldPrice > displayPrice
      ? Math.round(
          ((displayOldPrice - displayPrice) / displayOldPrice) * 100,
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

  // Structured data stays English-only regardless of the language toggle
  // (schema.org/SEO convention) — only the visible breadcrumb trail below
  // gets translated.
  const breadcrumbItemsForSeo = [
    { name: "Home", path: "/" },
    ...(product.category
      ? [
          {
            name: product.category.name,
            path: `/category/${product.category.slug}`,
          },
        ]
      : []),
    ...(product.subcategories?.[0] && product.category
      ? [
          {
            name: product.subcategories[0].name,
            path: `/category/${product.category.slug}/${product.subcategories[0].slug}`,
          },
        ]
      : []),
    { name: product.name },
  ];

  const breadcrumbItems = [
    { name: t("Home", "होम"), path: "/" },
    ...(product.category
      ? [
          {
            name: t(product.category.name, product.category.nameHi),
            path: `/category/${product.category.slug}`,
          },
        ]
      : []),
    ...(product.subcategories?.[0] && product.category
      ? [
          {
            name: t(
              product.subcategories[0].name,
              product.subcategories[0].nameHi,
            ),
            path: `/category/${product.category.slug}/${product.subcategories[0].slug}`,
          },
        ]
      : []),
    { name: t(product.name, product.nameHi) },
  ];

  const specRows = [
    { label: t("What's Included", "क्या शामिल है"), value: product.whatsIncluded },
    { label: t("Fabric", "फैब्रिक"), value: product.fabric },
    { label: t("Size", "साइज़"), value: product.size },
    { label: t("GSM", "GSM"), value: product.gsm },
    { label: t("Wash Care", "वॉश केयर"), value: product.washCare },
    { label: t("Brand", "ब्रांड"), value: product.brand },
    { label: t("Country of Origin", "मूल देश"), value: product.countryOfOrigin },
  ].filter((row) => row.value);

  const effectiveReturnDays =
    product.returnPeriodDays || defaultReturnPeriodDays;

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
    <div className="w-full min-w-0 max-w-6xl mx-auto px-4 py-12">
      <Seo
        title={product.name}
        description={
          product.description
            ? `Buy online, pan-India delivery (24hr in Ghaziabad) - ${product.description}`.slice(0, 160)
            : `Buy ${product.name} online with pan-India delivery - fast 24-hour delivery in Ghaziabad`
        }
        image={imgUrl(product.image)}
        url={shareUrl}
        jsonLd={[
          productJsonLd,
          buildBreadcrumbJsonLd(breadcrumbItemsForSeo),
          faqJsonLd,
        ]}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image gallery with zoom */}
        <div
          className={`min-w-0 grid grid-cols-1 gap-3 ${
            hasThumbnails ? "sm:grid-cols-[2fr_1fr]" : ""
          }`}
        >
          <div className="min-w-0">
            <div
              className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white aspect-square ${
                activeMedia?.type === "video" ? "" : "cursor-zoom-in"
              }`}
              onMouseMove={
                activeMedia?.type === "image" && supportsHoverZoom
                  ? handleMouseMove
                  : undefined
              }
              onMouseLeave={
                activeMedia?.type === "image" && supportsHoverZoom
                  ? handleMouseLeave
                  : undefined
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
                  {!mainImageLoaded && (
                    <div className="absolute inset-0 bg-slate-100 animate-pulse" />
                  )}

                  <img
                    key={activeMedia?.url}
                    src={`${imgUrl(activeMedia?.url, "w_1600,q_auto,f_auto")}`}
                    alt={t(product.name, product.nameHi)}
                    style={zoomStyle}
                    onLoad={() => setMainImageLoaded(true)}
                    className={`w-full h-full object-cover transition-all duration-300 pointer-events-none ${
                      mainImageLoaded ? "opacity-100" : "opacity-0"
                    }`}
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
              {t("Click to see full view", "पूरा दृश्य देखने के लिए क्लिक करें")}
            </button>
          </div>

          {hasThumbnails && (
            <div className="min-w-0 grid grid-cols-3 sm:grid-cols-1 gap-3 content-start">
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
                        src={`${imgUrl(item.url, "w_150,q_auto,f_auto")}`}
                        alt={`${t(product.name, product.nameHi)} - photo ${index + 1}`}
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
        <div className="min-w-0">
          <p className="text-sm text-slate-500 mb-1">
            {t(product.category?.name, product.category?.nameHi)}
            {product.subcategories?.length
              ? ` / ${product.subcategories
                  .map((sub) => t(sub.name, sub.nameHi))
                  .join(", ")}`
              : ""}
          </p>

          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            {t(product.name, product.nameHi)}
          </h1>

          {reviewStats.totalReviews > 0 && (
            <div className="flex items-center gap-1 text-amber-500 mb-4">
              <FaStar />
              <span className="text-slate-700 text-sm">
                {reviewStats.averageRating.toFixed(1)} ({reviewStats.totalReviews})
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-bold text-[#2e7d32]">
              ₹{displayPrice}
            </span>
            {displayOldPrice > displayPrice && (
              <span className="text-lg text-slate-400 line-through">
                ₹{displayOldPrice}
              </span>
            )}
          </div>

          {hasVariants && (
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">
                {t("Size", "साइज़")}:{" "}
                <span className="font-semibold text-slate-900">
                  {selectedVariant?.size}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.size}
                    type="button"
                    onClick={() => {
                      setSelectedVariant(variant);
                      setQuantity(1);
                    }}
                    disabled={variant.stock <= 0}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedVariant?.size === variant.size
                        ? "border-blue-700 bg-blue-50 text-blue-700"
                        : variant.stock <= 0
                          ? "border-slate-200 text-slate-300 cursor-not-allowed line-through"
                          : "border-slate-300 text-slate-700 hover:border-blue-400"
                    }`}
                  >
                    {variant.size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pointsPreview > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-amber-700 mb-4">
              <FaGift className="text-amber-500" />
              {t(
                `You'll earn ${pointsPreview} loyalty points on this order`,
                `इस ऑर्डर पर आपको ${pointsPreview} लॉयल्टी पॉइंट्स मिलेंगे`,
              )}
            </p>
          )}

          <p
            className={`text-sm font-semibold ${
              viewCount > 0 ? "mb-2" : "mb-4"
            } ${getStockStatus(displayStock).className}`}
          >
            {getStockStatus(displayStock).label}
          </p>

          {viewCount > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
              <FaEye className="text-slate-400" />
              {t(
                `${viewCount} ${viewCount === 1 ? "person" : "people"} viewed this in the last 30 days`,
                `पिछले 30 दिनों में ${viewCount} लोगों ने इसे देखा`,
              )}
            </p>
          )}

          <PincodeChecker />

          {product.colorVariesNote && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <FaPalette className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 font-medium">
                {product.colorVariesNote}
              </p>
            </div>
          )}

          {displayStock <= 0 &&
            (notifySubmitted ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
                {t("We'll email you when this is back in stock.", "जब यह फिर से स्टॉक में आएगा तो हम आपको ईमेल करेंगे।")}
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
                  placeholder={t("Your email", "आपका ईमेल")}
                  required
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={notifySending}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium disabled:opacity-60"
                >
                  {notifySending ? "..." : t("Notify Me", "मुझे सूचित करें")}
                </button>
              </form>
            ))}

          <div className="mb-6">
            <p
              className={`text-slate-600 leading-relaxed whitespace-pre-line ${
                descExpanded || displayDescription.length <= 280
                  ? ""
                  : "line-clamp-4"
              }`}
            >
              {displayDescription}
            </p>

            {displayDescription.length > 280 && (
              <button
                type="button"
                onClick={() => setDescExpanded((prev) => !prev)}
                className="text-sm font-medium text-blue-600 hover:underline mt-1.5"
              >
                {descExpanded
                  ? t("Show less", "कम दिखाएं")
                  : t("See more product details", "और प्रोडक्ट विवरण देखें")}
              </button>
            )}
          </div>

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
            <span className="text-sm font-medium text-slate-700">{t("Qty:", "मात्रा:")}</span>
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
                  setQuantity((q) => Math.min(q + 1, displayStock || q + 1))
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
              disabled={displayStock <= 0}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaShoppingCart />
              {t(`Add to Cart — ₹${displayPrice * quantity}`, `कार्ट में डालें — ₹${displayPrice * quantity}`)}
            </button>

            <button
              onClick={handleWishlistToggle}
              aria-label={t("Toggle wishlist", "विशलिस्ट टॉगल करें")}
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
            disabled={displayStock <= 0}
            className="w-full border-2 border-blue-900 text-blue-900 font-semibold rounded-full px-6 py-3 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("Buy it now", "अभी खरीदें")}
          </button>

          {whatsappPhone &&
            (displayStock <= 0 ? (
              <button
                type="button"
                disabled
                className="flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-400 font-semibold rounded-full px-6 py-3 mt-3 cursor-not-allowed"
              >
                <FaWhatsapp />
                {t("Order on WhatsApp", "WhatsApp पर ऑर्डर करें")}
              </button>
            ) : (
              <a
                href={`https://wa.me/${toWhatsAppNumber(whatsappPhone)}?text=${encodeURIComponent(
                  `Hi, I want to order this product:\n${product.name}${selectedVariant ? ` - Size: ${selectedVariant.size}` : ""} (₹${displayPrice})\n${shareUrl}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold rounded-full px-6 py-3 mt-3 transition-colors"
              >
                <FaWhatsapp />
                {t("Order on WhatsApp", "WhatsApp पर ऑर्डर करें")}
              </a>
            ))}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-6 border-t border-slate-200">
            {[
              {
                icon: <FaTruck />,
                label: t("Fast Delivery", "तेज़ डिलीवरी"),
              },
              {
                icon: <FaMoneyBillWave />,
                label: t("Pay on Delivery", "डिलीवरी पर भुगतान"),
              },
              product.isReturnable
                ? {
                    icon: <FaUndoAlt />,
                    label: t(`${effectiveReturnDays} days Return`, `${effectiveReturnDays} दिन रिटर्न`),
                  }
                : {
                    icon: <FaBan />,
                    label: t("Non-returnable", "गैर-वापसी योग्य"),
                  },
              {
                icon: <FaLock />,
                label: t("Secure Payment", "सुरक्षित भुगतान"),
              },
              {
                icon: <FaMedal />,
                label: t("100% Genuine", "100% असली"),
              },
              {
                icon: <FaWhatsapp />,
                label: t("WhatsApp Support", "WhatsApp सपोर्ट"),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center text-center gap-1.5"
              >
                <span className="text-lg text-slate-500">{item.icon}</span>
                <span className="text-xs text-slate-600">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-6">
            <span className="text-sm font-medium text-slate-700">
              {t("Share:", "शेयर करें:")}
            </span>
            {shareLinks.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                {...(label !== "Email" && {
                  target: "_blank",
                  rel: "noopener noreferrer",
                })}
                aria-label={t(`Share on ${label}`, `${label} पर शेयर करें`)}
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
            {t("← Continue Shopping", "← शॉपिंग जारी रखें")}
          </Link>
        </div>
      </div>

      {bundleProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-3xl font-bold text-slate-900">
              {t("Complete the Look", "लुक कम्प्लीट करें")}
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollBundle("prev")}
                aria-label={t("Previous products", "पिछले प्रोडक्ट")}
                className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <FaChevronLeft className="text-xs" />
              </button>
              <button
                type="button"
                onClick={() => scrollBundle("next")}
                aria-label={t("Next products", "अगले प्रोडक्ट")}
                className="w-9 h-9 rounded-full border border-blue-900 text-blue-900 hover:bg-blue-50 flex items-center justify-center"
              >
                <FaChevronRight className="text-xs" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
            <FaGift className="text-blue-700 shrink-0" />
            <span className="text-sm text-blue-800">
              {t(
                `Add a ${bundleCategory?.name} to this order and get `,
                `इस ऑर्डर में ${t(bundleCategory?.name, bundleCategory?.nameHi)} जोड़ें और पाएं `,
              )}
              <span className="font-bold">
                {t(`${bundleDiscountPercent}% off`, `${bundleDiscountPercent}% छूट`)}
              </span>{" "}
              {t("automatically at checkout — no code needed.", "चेकआउट पर अपने आप — कोई कोड ज़रूरी नहीं।")}
            </span>
          </div>

          <div
            ref={bundleScrollRef}
            className="flex gap-5 overflow-x-auto scroll-smooth pb-2"
          >
            {bundleProducts.map((bundleProduct) => (
              <div key={bundleProduct._id} className="w-64 shrink-0">
                <ProductCard product={bundleProduct} />
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-slate-900">
              {t("You may also like", "आपको ये भी पसंद आ सकते हैं")}
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollRelated("prev")}
                aria-label={t("Previous products", "पिछले प्रोडक्ट")}
                className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <FaChevronLeft className="text-xs" />
              </button>
              <button
                type="button"
                onClick={() => scrollRelated("next")}
                aria-label={t("Next products", "अगले प्रोडक्ट")}
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
              aria-label={isLightboxZoomed ? t("Zoom out", "ज़ूम आउट") : t("Zoom in", "ज़ूम इन")}
              className="absolute top-6 right-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              {isLightboxZoomed ? <FaSearchMinus /> : <FaSearchPlus />}
            </button>
          )}

          <button
            onClick={closeLightbox}
            aria-label={t("Close", "बंद करें")}
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
              aria-label={t("Previous", "पिछला")}
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
                alt={`${t(product.name, product.nameHi)} - ${t("photo", "फ़ोटो")} ${lightboxIndex + 1}`}
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
              aria-label={t("Next", "अगला")}
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
