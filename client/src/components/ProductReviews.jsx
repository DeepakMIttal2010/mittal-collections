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

const MAX_REVIEW_IMAGES = 3;

function ProductReviews({ productId }) {
  const { isLoggedIn } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, content: "" });
  const [formMessage, setFormMessage] = useState("");
  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [video, setVideo] = useState(null);
  const [videoPreview, setVideoPreview] = useState("");

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
  }, [isLoggedIn]);

  // Object URLs for the picked-but-not-yet-uploaded files — revoked whenever
  // the selection changes so we don't leak them across re-renders.
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setImagePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  useEffect(() => {
    if (!video) {
      setVideoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(video);
    setVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => [...prev, ...files].slice(0, MAX_REVIEW_IMAGES));
    e.target.value = "";
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoChange = (e) => {
    setVideo(e.target.files?.[0] || null);
    e.target.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setFormMessage("");

    const payload = new FormData();
    payload.append("productId", productId);
    payload.append("rating", formData.rating);
    payload.append("content", formData.content);
    images.forEach((file) => payload.append("images", file));
    if (video) payload.append("video", video);

    const response = await submitReview(payload);

    setSubmitting(false);

    if (response.success) {
      setFormMessage(response.message);
      setFormData({ rating: 5, content: "" });
      setImages([]);
      setVideo(null);
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

          <label className="block text-sm font-medium text-slate-700 mb-1">
            Photos{" "}
            <span className="text-slate-400 font-normal">
              (optional, up to {MAX_REVIEW_IMAGES})
            </span>
          </label>
          <div className="flex flex-wrap gap-2 mb-1">
            {images.map((file, index) => (
              <div key={file.name + index} className="relative w-16 h-16">
                <img
                  src={imagePreviews[index]}
                  alt=""
                  className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < MAX_REVIEW_IMAGES && (
              <label className="w-16 h-16 flex items-center justify-center border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs cursor-pointer hover:border-amber-400 hover:text-amber-500">
                + Add
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={handleImagesChange}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            JPG, PNG or WEBP, up to 5MB each
          </p>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            Video{" "}
            <span className="text-slate-400 font-normal">
              (optional, one short clip)
            </span>
          </label>
          {video ? (
            <div className="flex items-center gap-2 mb-1">
              <video
                src={videoPreview}
                muted
                className="w-24 h-16 object-cover rounded-lg border border-slate-200"
              />
              <button
                type="button"
                onClick={() => setVideo(null)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="inline-block border border-dashed border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-pointer hover:border-amber-400 hover:text-amber-500 mb-1">
              + Add a short video
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                hidden
                onChange={handleVideoChange}
              />
            </label>
          )}
          <p className="text-xs text-slate-400 mb-4">
            10-15 seconds, MP4/WEBM/MOV, up to 15MB
          </p>

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
                {review.title && (
                  <span className="font-semibold text-slate-800">
                    {review.title}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 mb-1.5">
                {review.content}
              </p>
              {(review.images?.length > 0 || review.video) && (
                <div className="flex flex-wrap gap-2 mb-1.5">
                  {review.images?.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="Customer photo"
                      className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                    />
                  ))}
                  {review.video && (
                    <video
                      src={review.video}
                      controls
                      className="w-24 h-16 object-cover rounded-lg border border-slate-200"
                    />
                  )}
                </div>
              )}
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
