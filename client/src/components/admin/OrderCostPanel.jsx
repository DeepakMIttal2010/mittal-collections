import { useEffect, useState } from "react";

import { getOrderCost, setOrderCost } from "../../services/adminOrderService";

const rupees = (n) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Per-order profit for the admin order list. Revenue is what the customer
// actually paid (totalPrice already has discounts, delivery fee and COD
// charge applied) minus anything refunded; costs come from the snapshot
// taken when the order was placed (see server/models/OrderCost.js).
// Renders nothing for staff whose role can't see financials (the API
// answers 403) so the panel never shows an error to them.
function OrderCostPanel({ order, canEdit }) {
  const [state, setState] = useState({ loading: true, hidden: false, cost: null });
  const [courier, setCourier] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    getOrderCost(order._id).then((res) => {
      if (cancelled) return;

      if (res.status === 403) {
        setState({ loading: false, hidden: true, cost: null });
        return;
      }

      if (!res.success) {
        setState({ loading: false, hidden: false, cost: null, failed: true });
        return;
      }

      setState({ loading: false, hidden: false, cost: res.cost });
      setCourier(res.cost?.courierCharge ?? "");
      setNote(res.cost?.courierNote || "");
    });

    return () => {
      cancelled = true;
    };
  }, [order._id]);

  if (state.hidden) return null;

  const { cost } = state;
  const isCancelled = order.orderStatus === "Cancelled";
  const revenue = (order.totalPrice || 0) - (order.refundedAmount || 0);

  const handleSave = async () => {
    const trimmed = String(courier).trim();
    const amount = trimmed === "" ? null : Number(trimmed);

    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setMessage("Enter a valid courier charge (0 or more).");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await setOrderCost(order._id, { courierCharge: amount, courierNote: note });

    setSaving(false);

    if (res.success) {
      setState((prev) => ({ ...prev, cost: res.cost }));
      setMessage("Saved.");
    } else {
      setMessage(res.message || "Could not save.");
    }
  };

  const courierEntered = cost && cost.courierCharge !== null && cost.courierCharge !== undefined;
  const profit = cost
    ? revenue - cost.productCost - cost.miscCost - (courierEntered ? cost.courierCharge : 0)
    : null;

  return (
    <div className="mt-6 pt-4 border-t border-slate-200">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">Profit (admin only)</h4>

      {state.loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : state.failed ? (
        <p className="text-sm text-red-600">Could not load the cost data for this order. Please refresh and try again.</p>
      ) : !cost ? (
        <p className="text-sm text-slate-500">
          No cost snapshot was recorded for this order (it was placed before cost tracking
          started), so profit cannot be shown.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Revenue{order.refundedAmount > 0 ? " (after refunds)" : ""}</span>
              <span>{rupees(revenue)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Product cost</span>
              <span>− {rupees(cost.productCost)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Misc expenses</span>
              <span>− {rupees(cost.miscCost)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Courier charge</span>
              <span>{courierEntered ? `− ${rupees(cost.courierCharge)}` : "not entered"}</span>
            </div>
            <div
              className={`flex justify-between font-semibold border-t border-slate-200 pt-1.5 mt-1 ${
                profit < 0 ? "text-red-600" : "text-green-700"
              }`}
            >
              <span>{courierEntered ? "Profit" : "Profit (before courier)"}</span>
              <span>{rupees(profit)}</span>
            </div>
            {isCancelled && (
              <p className="text-xs text-slate-400">
                This order is cancelled; it is not counted in revenue reports.
              </p>
            )}
          </div>

          {canEdit && (
            <div className="text-sm">
              <label className="block text-slate-600 mb-1" htmlFor={`courier-${order._id}`}>
                Courier charge paid by us (₹)
              </label>
              <input
                id={`courier-${order._id}`}
                type="number"
                min="0"
                step="0.01"
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-2"
              />
              <label className="block text-slate-600 mb-1" htmlFor={`courier-note-${order._id}`}>
                Courier / tracking note (optional)
              </label>
              <input
                id={`courier-note-${order._id}`}
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-3"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2"
              >
                {saving ? "Saving..." : "Save courier charge"}
              </button>
              {message && <p className="text-xs text-slate-500 mt-2">{message}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OrderCostPanel;
