import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaStar, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";

import {
  getAllReviewsAdmin,
  approveReview,
  deleteReview,
} from "../../services/adminReviewService";

function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("desc");

  const loadData = async () => {
    setLoading(true);

    const response = await getAllReviewsAdmin({ sortOrder });

    if (response.success) setReviews(response.reviews);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  const handleApprove = async (id) => {
    const response = await approveReview(id);

    if (response.success) loadData();
    else alert(response.message);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this review?")) return;

    const response = await deleteReview(id);

    if (response.success) loadData();
    else alert(response.message);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

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
      <p className="text-sm text-slate-500 mb-6">
        New reviews stay hidden from customers until you approve them.
      </p>

      {reviews.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Reviews Yet
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review._id}
              className="bg-white border border-slate-200 rounded-xl p-5"
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

                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                    review.isApproved
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {review.isApproved ? "Approved" : "Pending"}
                </span>
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
                {new Date(review.createdAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>

              <div className="flex items-center gap-2">
                {!review.isApproved && (
                  <button
                    onClick={() => handleApprove(review._id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() => handleDelete(review._id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminReviews;
