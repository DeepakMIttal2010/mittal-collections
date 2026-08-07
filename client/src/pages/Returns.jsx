import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaUndoAlt } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getMyReturnRequests } from "../services/returnService";
import { imgUrl } from "../services/api";

const STATUS_COLORS = {
  Requested: "bg-blue-100 text-blue-700",
  Approved: "bg-amber-100 text-amber-700",
  Rejected: "bg-red-100 text-red-700",
  "Picked Up": "bg-purple-100 text-purple-700",
  Refunded: "bg-green-100 text-green-700",
};

function Returns() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/returns");
      return;
    }

    getMyReturnRequests().then((response) => {
      if (response.success) setReturns(response.returns);
      setLoading(false);
    });
  }, [isLoggedIn, navigate]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">Your Returns</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">Your Returns</h1>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : returns.length === 0 ? (
        <div className="text-center py-16">
          <FaUndoAlt className="text-4xl text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 mb-4">
            You haven&apos;t requested any returns yet.
          </p>
          <Link to="/my-orders" className="text-blue-700 hover:underline">
            Go to Your Orders →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((ret) => (
            <div
              key={ret._id}
              className="flex items-center gap-4 border border-slate-200 rounded-xl p-4 bg-white"
            >
              {ret.productImage && (
                <img
                  src={imgUrl(ret.productImage)}
                  alt={ret.productName}
                  className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-100"
                />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 line-clamp-2">
                  {ret.productName}
                </p>
                <p className="text-xs text-slate-500">
                  Qty {ret.quantity} · Requested{" "}
                  {new Date(ret.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                {ret.adminNote && (
                  <p className="text-xs text-slate-500 mt-1">
                    Note: {ret.adminNote}
                  </p>
                )}
              </div>

              <span
                className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${
                  STATUS_COLORS[ret.status] || "bg-slate-100 text-slate-700"
                }`}
              >
                {ret.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Returns;
