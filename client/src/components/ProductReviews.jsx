import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar, FaRegStar, FaCheckCircle } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getProductReviews, getReviewEligibility, submitReview } from "../services/reviewService";
import { imgUrl } from "../services/api";
import { dateLocale } from "../utils/dateLocale";

function Stars({ value, size = "text-sm" }) {
  return (
    <span className={`flex items-center gap-0.5 text-amber-500 ${size}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        n <= Math.round(value) ? <FaStar key={n} /> : <FaRegStar key={n} />,
      )}
    </span>
  );
}

// Shown under each review the server marks as verified / rewarded (see
// toPublicReview in server/utils/publicReview.js). The server sends only
// yes/no flags — never the points or the order behind them.
export function ReviewBadges({ review, t }) {
  if (!review.verifiedPurchase && !review.rewarded) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 text-xs">
      {review.verifiedPurchase && (
        <span className="inline-flex items-center gap-1 text-green-700 font-medium">
          <FaCheckCircle aria-hidden="true" />
          {t("Verified purchase", "सत्यापित खरीद")}
        </span>
      )}
      {review.rewarded && (
        <span className="text-slate-500">
          {t("Received 50 loyalty points for reviewing", "रिव्यू के लिए 50 लॉयल्टी पॉइंट मिले")}
        </span>
      )}
    </div>
  );
}

const MAX_REVIEW_IMAGES = 3;
// Must match REVIEW_CONTENT_MAX_LENGTH in server/models/Review.js.
const MAX_REVIEW_LENGTH = 2000;

function ProductReviews({ productId }) {
  const { isLoggedIn } = useAuth();
  const { t, language } = useLanguage();

  const [reviews, setReviews] = useState([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, content: "" });
  // formMessage is { type: "success" | "error", text } or null. Errors
  // render red (role="alert"); the photo-consent error is shown inline
  // next to the consent checkbox instead (consentError).
  const [formMessage, setFormMessage] = useState(null);
  const [consentError, setConsentError] = useState("");
  const consentRef = useRef(null);
  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [video, setVideo] = useState(null);
  const [videoPreview, setVideoPreview] = useState("");
  // Unticked by default — the customer has to opt in before any photo or
  // video is shown publicly. The server enforces the same rule.
  const [photoConsent, setPhotoConsent] = useState(false);
  // null until known. If the check itself fails, the button is shown
  // anyway — submitReview makes the real decision server-side.
  const [eligibility, setEligibility] = useState(null);

  const canWriteReview = eligibility ? eligibility.eligible : true;

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
    if (!isLoggedIn) {
      setEligibility(null);
      return undefined;
    }

    let cancelled = false;

    getReviewEligibility(productId).then((response) => {
      if (cancelled) return;

      const known = response.success ? response : null;
      setEligibility(known);

      if (window.location.hash === "#reviews" && (!known || known.eligible)) {
        setShowForm(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, productId]);

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

  const photoConsentMessage = () =>
    t(
      "Please tick the box to agree that your photos/video may be shown publicly, or remove them.",
      "कृपया बॉक्स पर टिक करके सहमति दें कि आपकी फ़ोटो/वीडियो सार्वजनिक रूप से दिखाई जा सकती हैं, या उन्हें हटा दें।",
    );

  const showError = (text) => setFormMessage({ type: "error", text });

  // Inline, red, next to the checkbox — and move the customer there.
  const showConsentError = () => {
    setFormMessage(null);
    setConsentError(photoConsentMessage());
    const box = consentRef.current;
    if (box) {
      box.scrollIntoView?.({ behavior: "smooth", block: "center" });
      box.focus({ preventScroll: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const hasMedia = images.length > 0 || Boolean(video);

    if (hasMedia && !photoConsent) {
      showConsentError();
      return;
    }

    setSubmitting(true);
    setFormMessage(null);
    setConsentError("");

    const payload = new FormData();
    payload.append("productId", productId);
    payload.append("rating", formData.rating);
    payload.append("content", formData.content);
    images.forEach((file) => payload.append("images", file));
    if (video) payload.append("video", video);
    if (hasMedia && photoConsent) payload.append("photoConsent", "true");

    const response = await submitReview(payload);

    setSubmitting(false);

    if (response.success) {
      setFormMessage({ type: "success", text: response.message });
      setFormData({ rating: 5, content: "" });
      setImages([]);
      setVideo(null);
      setPhotoConsent(false);
      setShowForm(false);
      setEligibility((prev) => ({ ...prev, eligible: false, alreadyReviewed: true }));
    } else if (response.code === "NOT_ELIGIBLE") {
      showError(
        t(
          "You can review products you have bought and received.",
          "आप उन्हीं प्रोडक्ट्स का रिव्यू कर सकते हैं जो आपने खरीदे हैं और आपको मिल चुके हैं।",
        ),
      );
      setEligibility((prev) => ({ ...prev, eligible: false, hasPurchased: false }));
      setShowForm(false);
    } else if (response.code === "PHOTO_CONSENT_REQUIRED") {
      showConsentError();
    } else {
      showError(response.message || t("Unable to submit review", "रिव्यू सबमिट नहीं हो सका"));
    }
  };

  if (loading) return null;

  return (
    <div id="reviews" className="mt-16 border-t border-slate-200 pt-10 scroll-mt-20">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        {t("Customer Reviews", "ग्राहक रिव्यू")}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-8 items-start mb-8">
        <div className="text-center sm:text-left">
          <p className="text-4xl font-bold text-slate-900">
            {averageRating.toFixed(1)}
          </p>
          <Stars value={averageRating} size="text-base" />
          <p className="text-sm text-slate-500 mt-1">
            {t(
              `Based on ${totalReviews} review${totalReviews !== 1 ? "s" : ""}`,
              `${totalReviews} रिव्यू के आधार पर`,
            )}
          </p>
        </div>

        <div className="space-y-1.5 max-w-sm">
          {breakdown.map(({ star, count }) => (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-10 text-slate-600">{t(`${star} star`, `${star} स्टार`)}</span>
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
          {isLoggedIn && canWriteReview ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
            >
              {t("Write a Review", "रिव्यू लिखें")}
            </button>
          ) : isLoggedIn ? (
            <p className="text-sm text-slate-500 max-w-[16rem]">
              {eligibility?.alreadyReviewed
                ? t("You have already reviewed this product.", "आप इस प्रोडक्ट का रिव्यू पहले ही कर चुके हैं।")
                : t(
                    "You can review this product once it has been delivered to you.",
                    "यह प्रोडक्ट आपको डिलीवर होने के बाद आप इसका रिव्यू कर सकते हैं।",
                  )}
            </p>
          ) : (
            <Link
              to={`/login?redirect=/product/${productId}`}
              className="inline-block border border-amber-500 text-amber-600 hover:bg-amber-50 font-medium px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
            >
              {t("Login to Review", "रिव्यू के लिए लॉगिन करें")}
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-6 max-w-2xl">
        {t(
          "Approved reviews earn loyalty points (up to 50 per order), whatever the star rating — we want your honest opinion.",
          "स्वीकृत रिव्यू पर लॉयल्टी पॉइंट मिलते हैं (हर ऑर्डर पर अधिकतम 50), रेटिंग चाहे जो भी हो — हमें आपकी ईमानदार राय चाहिए।",
        )}
      </p>

      {formMessage?.type === "success" && (
        <p
          role="status"
          className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6"
        >
          {formMessage.text}
        </p>
      )}
      {formMessage?.type === "error" && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6"
        >
          {formMessage.text}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-200 rounded-xl p-5 mb-8 bg-white max-w-xl"
        >
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t("Your Rating", "आपकी रेटिंग")}
          </label>
          <div className="flex gap-1 text-2xl text-amber-500 mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFormData((f) => ({ ...f, rating: n }))}
                aria-label={t(`${n} star`, `${n} स्टार`)}
              >
                {n <= formData.rating ? <FaStar /> : <FaRegStar />}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t("Review", "रिव्यू")}
          </label>
          <textarea
            required
            rows={3}
            maxLength={MAX_REVIEW_LENGTH}
            value={formData.content}
            onChange={(e) =>
              setFormData((f) => ({ ...f, content: e.target.value }))
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-slate-400 text-right mb-4">
            {formData.content.length}/{MAX_REVIEW_LENGTH}
          </p>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t("Photos", "फ़ोटो")}{" "}
            <span className="text-slate-400 font-normal">
              {t(`(optional, up to ${MAX_REVIEW_IMAGES})`, `(वैकल्पिक, ${MAX_REVIEW_IMAGES} तक)`)}
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
                  aria-label={t("Remove photo", "फ़ोटो हटाएं")}
                  className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < MAX_REVIEW_IMAGES && (
              <label className="w-16 h-16 flex items-center justify-center border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs cursor-pointer hover:border-amber-400 hover:text-amber-500">
                {t("+ Add", "+ जोड़ें")}
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
            {t("JPG, PNG or WEBP, up to 5MB each", "JPG, PNG या WEBP, हर एक 5MB तक")}
          </p>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t("Video", "वीडियो")}{" "}
            <span className="text-slate-400 font-normal">
              {t("(optional, one short clip)", "(वैकल्पिक, एक छोटा क्लिप)")}
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
                {t("Remove", "हटाएं")}
              </button>
            </div>
          ) : (
            <label className="inline-block border border-dashed border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-pointer hover:border-amber-400 hover:text-amber-500 mb-1">
              {t("+ Add a short video", "+ एक छोटा वीडियो जोड़ें")}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                hidden
                onChange={handleVideoChange}
              />
            </label>
          )}
          <p className="text-xs text-slate-400 mb-4">
            {t("10-15 seconds, MP4/WEBM/MOV, up to 15MB", "10-15 सेकंड, MP4/WEBM/MOV, 15MB तक")}
          </p>

          <label className={`flex items-start gap-2 text-sm text-slate-700 cursor-pointer ${consentError ? "mb-1" : "mb-4"}`}>
            <input
              ref={consentRef}
              type="checkbox"
              name="photoConsent"
              checked={photoConsent}
              onChange={(e) => {
                setPhotoConsent(e.target.checked);
                if (e.target.checked) setConsentError("");
              }}
              aria-invalid={consentError ? "true" : undefined}
              aria-describedby={consentError ? "review-photo-consent-error" : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
            />
            <span>
              {t(
                "I agree that my photos/video may be shown publicly with my review",
                "मैं सहमत हूँ कि मेरी फ़ोटो/वीडियो मेरे रिव्यू के साथ सार्वजनिक रूप से दिखाए जा सकते हैं",
              )}
              <span className="block text-xs text-slate-400">
                {t(
                  "Needed only if you add photos or a video.",
                  "सिर्फ़ तब ज़रूरी है जब आप फ़ोटो या वीडियो जोड़ें।",
                )}
              </span>
            </span>
          </label>
          {consentError && (
            <p
              id="review-photo-consent-error"
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4"
            >
              {consentError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            {submitting ? t("Submitting...", "सबमिट हो रहा है...") : t("Submit Review", "रिव्यू सबमिट करें")}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-slate-500">
          {t("No reviews yet. Be the first to review this product!", "अभी तक कोई रिव्यू नहीं है। इस प्रोडक्ट का रिव्यू करने वाले पहले व्यक्ति बनें!")}
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
              <ReviewBadges review={review} t={t} />
              {(review.images?.length > 0 || review.video) && (
                <div className="flex flex-wrap gap-2 mb-1.5">
                  {review.images?.map((url) => (
                    <img
                      key={url}
                      src={imgUrl(url, "w_128,h_128,c_fill,q_auto,f_auto")}
                      alt={t("Customer photo", "ग्राहक फ़ोटो")}
                      loading="lazy"
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
                {review.user?.name || t("Customer", "ग्राहक")} ·{" "}
                {new Date(review.createdAt).toLocaleDateString(dateLocale(language), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {/* The store's reply — plain text in a text node, never HTML. */}
              {review.adminReply?.text && (
                <div className="mt-2.5 ml-3 border-l-2 border-amber-300 bg-amber-50/60 rounded-r-lg px-3 py-2">
                  <p className="text-xs font-semibold text-slate-800 mb-0.5">
                    {t("Reply from Mittal Collections", "Mittal Collections का जवाब")}
                  </p>
                  <p className="text-sm text-slate-600 whitespace-pre-line">
                    {review.adminReply.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductReviews;
