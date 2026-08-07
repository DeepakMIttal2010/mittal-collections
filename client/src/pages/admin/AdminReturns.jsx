import { useEffect, useState } from "react";
import { imgUrl } from "../../services/api";
import {
  getAllReturnRequestsAdmin,
  updateReturnStatus,
} from "../../services/returnService";

const STATUS_TABS = [
  "All",
  "Requested",
  "Approved",
  "Rejected",
  "Picked Up",
  "Refunded",
];

const STATUSES = ["Requested", "Approved", "Rejected", "Picked Up", "Refunded"];

const STATUS_COLORS = {
  Requested: "bg-blue-100 text-blue-700",
  Approved: "bg-amber-100 text-amber-700",
  Rejected: "bg-red-100 text-red-700",
  "Picked Up": "bg-purple-100 text-purple-700",
  Refunded: "bg-green-100 text-green-700",
};

function AdminReturns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [noteDrafts, setNoteDrafts] = useState({});

  const loadReturns = async () => {
    setLoading(true);

    const response = await getAllReturnRequestsAdmin(
      activeTab === "All" ? undefined : activeTab,
    );

    if (response.success) setReturns(response.returns);

    setLoading(false);
  };

  useEffect(() => {
    loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleStatusChange = async (id, status) => {
    const response = await updateReturnStatus(id, status, noteDrafts[id]);

    if (response.success) {
      loadReturns();
    } else {
      alert(response.message || "Unable to update status");
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Return Requests
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading...</div>
      ) : returns.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No return requests here.
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((ret) => (
            <div
              key={ret._id}
              className="bg-white border border-slate-200 rounded-xl p-4"
            >
              <div className="flex items-start gap-4 flex-wrap">
                {ret.productImage && (
                  <img
                    src={imgUrl(ret.productImage)}
                    alt={ret.productName}
                    className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-100"
                  />
                )}

                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-slate-800">
                    {ret.productName}
                  </p>
                  <p className="text-sm text-slate-500">
                    Qty {ret.quantity} · {ret.user?.name} · {ret.user?.email}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    <strong>Reason:</strong> {ret.reason}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Order #{ret.order?._id?.slice(-8)} ·{" "}
                    {new Date(ret.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${
                    STATUS_COLORS[ret.status] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {ret.status}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                <input
                  type="text"
                  placeholder="Note to customer (optional)"
                  defaultValue={ret.adminNote}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({
                      ...prev,
                      [ret._id]: e.target.value,
                    }))
                  }
                  className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <select
                  value={ret.status}
                  onChange={(e) => handleStatusChange(ret._id, e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminReturns;
