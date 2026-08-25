import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar, FaRegStar } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getProductReviews, submitReview } from "../services/reviewService";

function Stars({ value, size = "text-sm" }) {
  return (
    <span className={`flex items-center gap-0.5 text-amber-500 ${size}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        n <= Math.round(value) ? <FaStar key={n} /> : <FaRegStar key={n} />,
      )}
    </span>
  );
}

function ProductReviews({ productId }) {
  const { isLoggedIn } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, title: "", content: "" });
  const [formMessage, setFormMessage] = useState("");

  const loadReviews = async () => {
    setLoading(true);

    const response = await getProductReviews(productId);

    if (response.success) {
      setReviews(response.reviews);
      setTotalReviews(response.totalReviews);
      setAverageRating(response.averageRating);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // The review-request email links straight to /product/:id#reviews so a
  // customer doesn't have to scroll and hunt for this section themselves
  // — open the form immediately too, since the whole point of that link
  // is "write a review right now", not just "look at this section".
  useEffect(() => {
    if (isLoggedIn && window.location.hash === "#reviews") {
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setFormMessage("");

    const response = await submitReview({ productId, ...formData });

    setSubmitting(false);

    if (response.success) {
      setFormMessage(response.message);
      setFormData({ rating: 5, title: "", content: "" });
      setShowForm(false);
    } else {
      setFormMessage(response.message || "Unable to submit review");
    }
  };

  if (loading) return null;

  return (
    <div id="reviews" className="mt-16 border-t border-slate-200 pt-10 scroll-mt-20">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Customer Reviews
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-8 items-start mb-8">
        <div className="text-center sm:text-left">
          <p className="text-4xl font-bold text-slate-900">
            {averageRating.toFixed(1)}
          </p>
          <Stars value={averageRating} size="text-base" />
          <p className="text-sm text-slate-500 mt-1">
            Based on {totalReviews} review{totalReviews !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="space-y-1.5 max-w-sm">
          {breakdown.map(({ star, count }) => (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-10 text-slate-600">{star} star</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{
                    width: totalReviews
                      ? `${(count / totalReviews) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="w-6 text-slate-500 text-right">{count}</span>
            </div>
          ))}
        </div>

        <div>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
            >
              Write a Review
            </button>
          ) : (
            <Link
              to={`/login?redirect=/product/${productId}`}
              className="inline-block border border-amber-500 text-amber-600 hover:bg-amber-50 font-medium px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
            >
              Login to Review
            </Link>
          )}
        </div>
      </div>

      {formMessage && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
          {formMessage}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-200 rounded-xl p-5 mb-8 bg-white max-w-xl"
        >
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Your Rating
          </label>
          <div className="flex gap-1 text-2xl text-amber-500 mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFormData((f) => ({ ...f, rating: n }))}
                aria-label={`${n} star`}
              >
                {n <= formData.rating ? <FaStar /> : <FaRegStar />}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            Review Title
          </label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) =>
              setFormData((f) => ({ ...f, title: e.target.value }))
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">
            Review
          </label>
          <textarea
            required
            rows={3}
            value={formData.content}
            onChange={(e) =>
              setFormData((f) => ({ ...f, content: e.target.value }))
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <button
            type="submit"
            disabled={submitting}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-slate-500">
          No reviews yet. Be the first to review this product!
        </p>
      ) : (
        <div className="space-y-5">
          {reviews.map((review) => (
            <div
              key={review._id}
              className="border-b border-slate-100 pb-5 last:border-b-0"
            >
              <div className="flex items-center gap-3 mb-1.5">
                <Stars value={review.rating} />
                <span className="font-semibold text-slate-800">
                  {review.title}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-1.5">
                {review.content}
              </p>
              <p className="text-xs text-slate-400">
                {review.user?.name || "Anonymous"} ·{" "}
                {new Date(review.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductReviews;
