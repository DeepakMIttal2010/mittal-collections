import { useEffect, useState } from "react";

import {
  getRewardsSettingsAdmin,
  updateLoyaltySettings,
  updateReferralSettings,
} from "../../services/rewardsService";

function AdminRewardsSettings() {
  const [loading, setLoading] = useState(true);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [savingReferral, setSavingReferral] = useState(false);
  const [changeLog, setChangeLog] = useState([]);

  const [loyalty, setLoyalty] = useState({
    earnRate: 20,
    redeemValue: 1,
    maxRedeemPercent: 0.5,
    minRedeemPoints: 50,
    expiryMonths: 12,
  });

  const [referral, setReferral] = useState({
    referrerPoints: 100,
    referredPoints: 50,
  });

  const loadSettings = async () => {
    setLoading(true);

    const response = await getRewardsSettingsAdmin();

    if (response.success) {
      setLoyalty({
        earnRate: response.loyalty.earnRate,
        redeemValue: response.loyalty.redeemValue,
        maxRedeemPercent: response.loyalty.maxRedeemPercent,
        minRedeemPoints: response.loyalty.minRedeemPoints,
        expiryMonths: response.loyalty.expiryMonths,
      });
      setReferral({
        referrerPoints: response.referral.referrerPoints,
        referredPoints: response.referral.referredPoints,
      });
      setChangeLog(response.changeLog);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleLoyaltySubmit = async (e) => {
    e.preventDefault();
    setSavingLoyalty(true);

    const response = await updateLoyaltySettings(loyalty);

    setSavingLoyalty(false);

    if (response.success) {
      alert("Loyalty settings updated");
      loadSettings();
    } else {
      alert(response.message || "Unable to update");
    }
  };

  const handleReferralSubmit = async (e) => {
    e.preventDefault();
    setSavingReferral(true);

    const response = await updateReferralSettings(referral);

    setSavingReferral(false);

    if (response.success) {
      alert("Referral settings updated");
      loadSettings();
    } else {
      alert(response.message || "Unable to update");
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Loading...</div>;
  }

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Rewards Settings
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <form
          onSubmit={handleLoyaltySubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-slate-800">Loyalty Points</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ₹ spent per point earned
            </label>
            <input
              type="number"
              min={1}
              value={loyalty.earnRate}
              onChange={(e) =>
                setLoyalty({ ...loyalty, earnRate: Number(e.target.value) })
              }
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">
              e.g. 20 means ₹20 spent = 1 point
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ₹ discount per point redeemed
            </label>
            <input
              type="number"
              min={1}
              value={loyalty.redeemValue}
              onChange={(e) =>
                setLoyalty({ ...loyalty, redeemValue: Number(e.target.value) })
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Max redeemable (% of order subtotal)
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={loyalty.maxRedeemPercent}
              onChange={(e) =>
                setLoyalty({
                  ...loyalty,
                  maxRedeemPercent: Number(e.target.value),
                })
              }
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">
              e.g. 0.5 means points can cover at most 50% of an order
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Minimum points required to redeem
            </label>
            <input
              type="number"
              min={0}
              value={loyalty.minRedeemPoints}
              onChange={(e) =>
                setLoyalty({
                  ...loyalty,
                  minRedeemPoints: Number(e.target.value),
                })
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Points expire after (months of inactivity)
            </label>
            <input
              type="number"
              min={1}
              value={loyalty.expiryMonths}
              onChange={(e) =>
                setLoyalty({
                  ...loyalty,
                  expiryMonths: Number(e.target.value),
                })
              }
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">
              If a customer earns no new points for this many months, their
              remaining balance expires.
            </p>
          </div>

          <button
            type="submit"
            disabled={savingLoyalty}
            className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {savingLoyalty ? "Saving..." : "Save Loyalty Settings"}
          </button>
        </form>

        <form
          onSubmit={handleReferralSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-slate-800">Referral Program</h3>
          <p className="text-sm text-slate-500 -mt-2">
            Paid out once the referred customer&apos;s first order is
            delivered.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Points for the referrer (existing customer)
            </label>
            <input
              type="number"
              min={0}
              value={referral.referrerPoints}
              onChange={(e) =>
                setReferral({
                  ...referral,
                  referrerPoints: Number(e.target.value),
                })
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Points for the referred friend (new customer)
            </label>
            <input
              type="number"
              min={0}
              value={referral.referredPoints}
              onChange={(e) =>
                setReferral({
                  ...referral,
                  referredPoints: Number(e.target.value),
                })
              }
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={savingReferral}
            className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {savingReferral ? "Saving..." : "Save Referral Settings"}
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <h3 className="font-semibold text-slate-800 px-6 py-4 border-b border-slate-100">
          Recent Changes
        </h3>

        {changeLog.length === 0 ? (
          <p className="text-slate-500 text-sm px-6 py-6">
            No changes made yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">When</th>
                <th className="text-left px-4 py-2 font-semibold">Module</th>
                <th className="text-left px-4 py-2 font-semibold">Field</th>
                <th className="text-left px-4 py-2 font-semibold">Change</th>
                <th className="text-left px-4 py-2 font-semibold">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {changeLog.map((entry) => (
                <tr key={entry._id}>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 capitalize text-slate-700">
                    {entry.module}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{entry.field}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {String(entry.oldValue)} → {String(entry.newValue)}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {entry.changedBy?.name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminRewardsSettings;
