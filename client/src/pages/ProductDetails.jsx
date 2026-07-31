import { SERVER_URL } from "../services/api";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FaStar,
  FaShoppingCart,
  FaHeart,
  FaSearchPlus,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
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

function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [zoomStyle, setZoomStyle] = useState({});
  const [activeImage, setActiveImage] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);

  const relatedScrollRef = useRef(null);

  const { addToCart } = useCart();
  const { wishlistItems, addToWishlist, removeFromWishlist } = useWishlist();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);
      setRelatedProducts([]);

      const response = await getProductById(id);

      if (response.success) {
        setProduct(response.product);
        setActiveImage(response.product.image);

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

  const gallery = product?.images?.length ? product.images : [];
  const secondaryImages = gallery.filter((img) => img !== activeImage);
  const hasGallery = secondaryImages.length > 0;
  const allImages = product?.images?.length ? product.images : [product?.image];

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

  const openLightbox = () => {
    setLightboxIndex(allImages.indexOf(activeImage));
  };

  const closeLightbox = () => setLightboxIndex(null);

  const showPrevImage = () =>
    setLightboxIndex((prev) => (prev - 1 + allImages.length) % allImages.length);

  const showNextImage = () =>
    setLightboxIndex((prev) => (prev + 1) % allImages.length);

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
    return (
      <div className="p-16 text-center text-slate-500">Loading...</div>
    );
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

  const shareUrl = window.location.href;
  const shareText = product.name;

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
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(`${SERVER_URL}${product.image}`)}&description=${encodeURIComponent(shareText)}`,
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image gallery with zoom */}
        <div
          className={`grid grid-cols-1 gap-3 ${
            hasGallery ? "sm:grid-cols-[2fr_1fr]" : ""
          }`}
        >
          <div
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white cursor-zoom-in aspect-square"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={openLightbox}
          >
            <img
              src={`${SERVER_URL}${activeImage}`}
              alt={product.name}
              style={zoomStyle}
              className="w-full h-full object-cover transition-transform duration-200 pointer-events-none"
            />

            <span className="absolute top-3 right-3 bg-white/90 text-slate-600 rounded-full p-2 shadow">
              <FaSearchPlus className="text-sm" />
            </span>

            {discount > 0 && (
              <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {discount}% OFF
              </span>
            )}
          </div>

          {hasGallery && (
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-3">
              {secondaryImages.map((img) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActiveImage(img)}
                  className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-amber-400 transition-colors"
                >
                  <img
                    src={`${SERVER_URL}${img}`}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-sm text-slate-500 mb-1">
            {product.category?.name}
            {product.subcategory?.name ? ` / ${product.subcategory.name}` : ""}
          </p>

          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {product.name}
          </h1>

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

          <p
            className={`text-sm font-medium mb-4 ${
              product.stock > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {product.stock > 0 ? `In Stock (${product.stock})` : "Out of Stock"}
          </p>

          <p className="text-slate-600 leading-relaxed mb-6">
            {product.description}
          </p>

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

      {lightboxIndex !== null && (
        <div
          onClick={closeLightbox}
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
        >
          <span className="absolute top-6 left-6 text-white/80 text-sm font-medium">
            {lightboxIndex + 1} / {allImages.length}
          </span>

          <button
            onClick={closeLightbox}
            aria-label="Close"
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <FaTimes />
          </button>

          {allImages.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showPrevImage();
              }}
              aria-label="Previous image"
              className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <FaChevronLeft />
            </button>
          )}

          <img
            src={`${SERVER_URL}${allImages[lightboxIndex]}`}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain"
          />

          {allImages.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showNextImage();
              }}
              aria-label="Next image"
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
