import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar } from "react-icons/fa";

import { getShowcaseReviews } from "../services/reviewService";
import { productUrl } from "../utils/productUrl";
import { useLanguage } from "../context/LanguageContext";

// Real customer photos are the whole point here — see the "real photos
// over stock images" convention this project already follows for product
// listings; it applies just as much to social proof.
function CustomerGallery() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const load = async () => {
      const response = await getShowcaseReviews();

      if (response.success) setReviews(response.reviews);

      setLoading(false);
    };

    load();
  }, []);

  if (loading || reviews.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
            {t("In Our Customers' Homes", "हमारे ग्राहकों के घरों में")}
          </h2>
          <p className="text-slate-500">
            {t(
              "Real photos from real orders — not stock images.",
              "असली ऑर्डर की असली तस्वीरें — स्टॉक फोटो नहीं।",
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {reviews.map((review) => (
            <Link
              key={review._id}
              to={review.product ? `${productUrl(review.product)}#reviews` : "#"}
              className="group relative block aspect-square rounded-xl overflow-hidden bg-slate-100"
            >
              <img
                src={review.images[0]}
                alt={review.product?.name || "Customer photo"}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-8">
                <div className="flex items-center gap-0.5 text-amber-400 text-xs mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <FaStar
                      key={i}
                      className={i < review.rating ? "" : "text-white/30"}
                    />
                  ))}
                </div>
                <p className="text-white text-xs font-medium truncate">
                  {review.user?.name || "Verified Buyer"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default CustomerGallery;
