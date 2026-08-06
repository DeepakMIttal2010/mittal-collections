import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getMyLoyaltyTransactions,
  getPublicRewardsInfo,
} from "../services/rewardsService";

const TYPE_LABELS = {
  earned: "Earned",
  redeemed: "Redeemed",
  refunded: "Refunded",
  clawback: "Reversed",
  referral_bonus: "Referral Bonus",
  admin_adjustment: "Adjustment",
  expired: "Expired",
};

function LoyaltyHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loyaltyRules, setLoyaltyRules] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await getMyLoyaltyTransactions(page);

      if (response.success) {
        setTransactions(response.transactions);
        setPages(response.pages);
      }

      setLoading(false);
    };

    load();
  }, [page]);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setLoyaltyRules(response.loyalty);
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        to="/account"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        ← Your Account
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        Points History
      </h1>

      {loyaltyRules && (
        <p className="text-sm text-slate-500 mb-6">
          Earn 1 point per ₹{loyaltyRules.earnRate} spent (credited on
          delivery). Redeem points for ₹{loyaltyRules.redeemValue} off each,
          up to {Math.round(loyaltyRules.maxRedeemPercent * 100)}% of an
          order — minimum {loyaltyRules.minRedeemPoints} points to redeem.
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="text-slate-500">No points activity yet.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Description
                </th>
                <th className="text-right px-4 py-3 font-semibold">Points</th>
                <th className="text-right px-4 py-3 font-semibold">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx._id}>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {TYPE_LABELS[tx.type] || tx.type}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {tx.description}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      tx.points > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {tx.points > 0 ? "+" : ""}
                    {tx.points}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {tx.balanceAfter}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                Previous
              </button>
              <span className="text-slate-500">
                Page {page} of {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LoyaltyHistory;
