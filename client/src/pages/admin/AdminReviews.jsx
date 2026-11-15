import { imgUrl } from "../../services/api";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";

import {
  getAllReviewsAdmin,
  getReviewSummaryAdmin,
  approveReview,
  deleteReview,
  hideReview,
  unhideReview,
  saveReviewReply,
  deleteReviewReply,
} from "../../services/adminReviewService";
import ReviewBonusReversal from "../../components/admin/ReviewBonusReversal";

// Must match REVIEW_HIDDEN_REASON_MAX_LENGTH / REVIEW_REPLY_MAX_LENGTH in
// server/models/Review.js.
const MAX_HIDE_REASON = 500;
const MAX_REPLY = 1000;

const EMPTY_FILTERS = {
  status: "",
  visibility: "",
  rating: "",
  hasPhotos: "",
  rewarded: "",
  from: "",
  to: "",
};

const FILTER_SELECTS = [
  { key: "status", label: "Status", options: [["", "All"], ["pending", "Pending"], ["approved", "Approved"]] },
  { key: "visibility", label: "Visibility", options: [["", "All"], ["visible", "Visible"], ["hidden", "Hidden"]] },
  { key: "rating", label: "Rating", options: [["", "All"], ["5", "5 star"], ["4", "4 star"], ["3", "3 star"], ["2", "2 star"], ["1", "1 star"]] },
  { key: "hasPhotos", label: "Photos", options: [["", "All"], ["true", "With photos"], ["false", "No photos"]] },
  { key: "rewarded", label: "Bonus", options: [["", "All"], ["true", "Rewarded"], ["reversed", "Reversed"], ["false", "Not rewarded"]] },
];

const formatAvg = (value) => (typeof value === "number" ? value.toFixed(2) : "—");

const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function SummaryCard({ label, value, hint }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  // Set when the server's 2000-review safety cap cut the list short.
  const [listMeta, setListMeta] = useState({ total: 0, truncated: false });
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Reply editor: which review is open and its draft text.
  const [replyFor, setReplyFor] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  // Reviews with an action request in flight; their buttons are disabled.
  const [busyIds, setBusyIds] = useState(() => new Set());
  // Only the newest list request may write state, so a slow older
  // response can't overwrite the result of a newer filter/sort.
  const listRequestRef = useRef(0);
  // Mirrors busyIds synchronously, so a fast double click can't start a
  // second request before React re-renders with the button disabled.
  const busyRef = useRef(new Set());
  // The open reply editor, readable after an await.
  const replyForRef = useRef(null);
  useEffect(() => {
    replyForRef.current = replyFor;
  }, [replyFor]);

  const loadSummary = async () => {
    const response = await getReviewSummaryAdmin();
    if (response.success) setSummary(response.summary);
  };

  // background: refresh after an action without blanking the list (so
  // the scroll position stays put). The full "Loading..." is only for the
  // first load and filter/sort changes.
  const loadData = async ({ background = false } = {}) => {
    const requestId = ++listRequestRef.current;

    if (!background) setLoading(true);

    const response = await getAllReviewsAdmin({ sortOrder, filters });

    if (requestId !== listRequestRef.current) return;

    if (response.success) {
      setReviews(response.reviews);
      setListMeta({ total: response.total, truncated: response.truncated });
      setListError("");
    } else if (!background) {
      setReviews([]);
      setListMeta({ total: 0, truncated: false });
      setListError(response.message || "Unable to load reviews");
    }

    setLoading(false);
  };

  const refreshInBackground = ({ withSummary }) => {
    loadData({ background: true });
    if (withSummary) loadSummary();
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, filters]);

  useEffect(() => {
    loadSummary();
  }, []);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  // Runs one review's action with that review's buttons disabled. A
  // second action on the same review while one is running is ignored.
  const runAction = async (id, action) => {
    if (busyRef.current.has(id)) return;

    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    try {
      await action();
    } finally {
      busyRef.current.delete(id);
      setBusyIds(new Set(busyRef.current));
    }
  };

  // Show the server's updated review straight away. The action endpoints
  // return it without user/product populated, so those stay as listed.
  const patchReview = (updated) => {
    if (!updated?._id) return;
    setReviews((prev) =>
      prev.map((r) =>
        r._id === updated._id ? { ...r, ...updated, user: r.user, product: r.product } : r,
      ),
    );
  };

  // Returns true on success. The review may no longer match the current
  // filters after the change, so the list is also re-fetched quietly.
  const afterAction = (response, { withSummary }) => {
    if (!response.success) {
      alert(response.message);
      return false;
    }
    patchReview(response.review);
    refreshInBackground({ withSummary });
    return true;
  };

  const handleApprove = (id) =>
    runAction(id, async () => {
      afterAction(await approveReview(id), { withSummary: true });
    });

  const handleDelete = (id) => {
    if (!window.confirm("Delete this review?")) return;

    runAction(id, async () => {
      const response = await deleteReview(id);

      if (!response.success) {
        alert(response.message);
        return;
      }

      setReviews((prev) => prev.filter((r) => r._id !== id));
      if (replyForRef.current === id) {
        setReplyFor(null);
        setReplyDraft("");
      }
      refreshInBackground({ withSummary: true });
    });
  };

  const handleHide = (id) => {
    const input = window.prompt(
      `Why hide this review? (required, up to ${MAX_HIDE_REASON} characters — only admins see this)`,
    );
    if (input === null) return;

    const reason = input.trim();
    if (!reason || reason.length > MAX_HIDE_REASON) {
      alert(`Please enter a reason of 1-${MAX_HIDE_REASON} characters.`);
      return;
    }

    runAction(id, async () => {
      afterAction(await hideReview(id, reason), { withSummary: true });
    });
  };

  const handleUnhide = (id) =>
    runAction(id, async () => {
      afterAction(await unhideReview(id), { withSummary: true });
    });

  const openReply = (review) => {
    // Opening another review's editor replaces the current draft, so ask
    // first if that draft has unsaved changes.
    if (replyFor && replyFor !== review._id) {
      const saved = reviews.find((r) => r._id === replyFor)?.adminReply?.text || "";
      if (
        replyDraft.trim() !== saved.trim() &&
        !window.confirm("Discard your unsaved reply on the other review?")
      ) {
        return;
      }
    }

    setReplyFor(review._id);
    setReplyDraft(review.adminReply?.text || "");
  };

  const handleSaveReply = (id) => {
    const text = replyDraft.trim();
    if (!text) {
      alert("Reply cannot be empty.");
      return;
    }

    runAction(id, async () => {
      if (afterAction(await saveReviewReply(id, text), { withSummary: false })) {
        // Close the editor only if it's still this review's: the admin
        // may have opened another review's editor while this saved.
        if (replyForRef.current === id) {
          setReplyFor(null);
          setReplyDraft("");
        }
      }
    });
  };

  const handleDeleteReply = (id) => {
    if (!window.confirm("Remove the public reply?")) return;

    runAction(id, async () => {
      afterAction(await deleteReviewReply(id), { withSummary: false });
    });
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Reviews</h2>

        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
          }
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
        >
          {sortOrder === "desc" ? (
            <FaSortAmountDown className="text-xs" />
          ) : (
            <FaSortAmountUp className="text-xs" />
          )}
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        New reviews stay hidden from customers until you approve them. Hiding
        an approved review removes it from the site and its rating; loyalty
        points are never changed by hiding.
      </p>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <SummaryCard label="Total reviews" value={summary.total} />
          <SummaryCard
            label="Approved / Pending"
            value={`${summary.byStatus.approved} / ${summary.byStatus.pending}`}
          />
          <SummaryCard label="Hidden" value={summary.hidden} />
          <SummaryCard
            label="Average rating"
            value={formatAvg(summary.averageRating)}
            hint={`Public: ${formatAvg(summary.publicAverageRating)}`}
          />
          <SummaryCard
            label="Rewarded avg"
            value={formatAvg(summary.rewarded.averageRating)}
            hint={`${summary.rewarded.count} reviews · ${summary.reversed ?? 0} reversed`}
          />
          <SummaryCard
            label="Not rewarded avg"
            value={formatAvg(summary.nonRewarded.averageRating)}
            hint={`${summary.nonRewarded.count} reviews`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-slate-200 rounded-lg p-3">
        {FILTER_SELECTS.map(({ key, label, options }) => (
          <label key={key} className="text-xs text-slate-500 flex flex-col gap-1">
            {label}
            <select
              value={filters[key]}
              onChange={(e) => setFilter(key, e.target.value)}
              className="text-sm text-slate-700 border border-slate-300 rounded-md px-2 py-1.5"
            >
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          From
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilter("from", e.target.value)}
            className="text-sm text-slate-700 border border-slate-300 rounded-md px-2 py-1"
          />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilter("to", e.target.value)}
            className="text-sm text-slate-700 border border-slate-300 rounded-md px-2 py-1"
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs font-medium text-blue-600 hover:underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {!loading && !listError && listMeta.truncated && (
        <p
          role="status"
          className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4"
        >
          Showing the {sortOrder === "desc" ? "newest" : "oldest"} {reviews.length} of{" "}
          {listMeta.total} matching reviews. Narrow the filters (e.g. by date) to see the rest.
        </p>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading...</div>
      ) : listError ? (
        <div className="text-center text-red-600 py-12 bg-white rounded-lg border border-red-200">
          {listError}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          {hasFilters ? "No reviews match these filters" : "No Reviews Yet"}
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const busy = busyIds.has(review._id);
            const hasMedia = review.images?.length > 0 || Boolean(review.video);

            return (
            <div
              key={review._id}
              aria-busy={busy || undefined}
              className={`bg-white border rounded-xl p-5 ${
                review.isHidden ? "border-slate-300 bg-slate-50" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  {review.product?.image && (
                    <img
                      src={imgUrl(review.product.image)}
                      alt={review.product.name}
                      className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                  )}
                  <div>
                    {review.product ? (
                      <>
                        <Link
                          to={`/product/${review.product._id}`}
                          target="_blank"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {review.product.name}
                        </Link>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Product ID: {review.product._id}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Deleted product
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-0.5 text-amber-500 text-sm">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <FaStar
                            key={i}
                            className={
                              i < review.rating ? "" : "text-slate-200"
                            }
                          />
                        ))}
                      </span>
                      {review.title && (
                        <h4 className="font-semibold text-slate-800">
                          {review.title}
                        </h4>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {review.pointsAwarded > 0 &&
                    (review.bonusReversal?.reversedAt ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                        <span className="line-through">+{review.pointsAwarded} pts</span> (reversed)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                        +{review.pointsAwarded} pts
                      </span>
                    ))}
                  {review.isHidden && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                      Hidden
                    </span>
                  )}
                  {hasMedia && (
                    <span
                      title={
                        review.photoConsent
                          ? "The reviewer agreed: photos/video are shown on the site"
                          : "No consent: photos/video are never shown on the site"
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        review.photoConsent
                          ? "bg-sky-100 text-sky-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {review.photoConsent ? "Photos public" : "Photos not public"}
                    </span>
                  )}
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      review.isApproved
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {review.isApproved ? "Approved" : "Pending"}
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-2">{review.content}</p>

              {(review.images?.length > 0 || review.video) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {review.images?.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt="Customer photo"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                      />
                    </a>
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

              <p className="text-xs text-slate-400 mb-3">
                {review.user?.name} ({review.user?.email}) ·{" "}
                {formatDateTime(review.createdAt)}
              </p>

              {review.isHidden && (
                <p className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-3">
                  <span className="font-semibold">Hidden reason:</span>{" "}
                  {review.hiddenReason}
                  {review.hiddenAt && (
                    <span className="text-slate-400"> · {formatDateTime(review.hiddenAt)}</span>
                  )}
                </p>
              )}

              {review.adminReply?.text && replyFor !== review._id && (
                <div className="text-sm bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-amber-800 mb-0.5">
                    Reply from Mittal Collections (public)
                  </p>
                  <p className="text-slate-700 whitespace-pre-line">{review.adminReply.text}</p>
                </div>
              )}

              {replyFor === review._id && (
                <div className="mb-3">
                  <textarea
                    aria-label="Public reply to this review"
                    rows={3}
                    maxLength={MAX_REPLY}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Public reply shown under this review"
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400">
                      {replyDraft.length}/{MAX_REPLY} · plain text, visible to customers
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyFor(null)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveReply(review._id)}
                        disabled={busy}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save reply
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!review.isApproved && (
                  // A hidden review can't be approved (the server refuses
                  // with 409), so unhide it first.
                  <button
                    type="button"
                    onClick={() => handleApprove(review._id)}
                    disabled={busy || review.isHidden}
                    title={review.isHidden ? "Unhide this review before approving it" : undefined}
                    aria-describedby={review.isHidden ? `approve-hint-${review._id}` : undefined}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
                  >
                    Approve
                  </button>
                )}
                {review.isHidden ? (
                  <button
                    type="button"
                    onClick={() => handleUnhide(review._id)}
                    disabled={busy}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Unhide
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleHide(review._id)}
                    disabled={busy}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Hide
                  </button>
                )}
                {replyFor !== review._id && (
                  <button
                    type="button"
                    onClick={() => openReply(review)}
                    disabled={busy}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500 text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {review.adminReply?.text ? "Edit reply" : "Reply"}
                  </button>
                )}
                {review.adminReply?.text && replyFor !== review._id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteReply(review._id)}
                    disabled={busy}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove reply
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(review._id)}
                  disabled={busy}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
                {!review.isApproved && review.isHidden && (
                  <span id={`approve-hint-${review._id}`} className="text-[11px] text-slate-500">
                    Unhide before approving.
                  </span>
                )}
              </div>

              <ReviewBonusReversal review={review} onReversed={loadData} />
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminReviews;
