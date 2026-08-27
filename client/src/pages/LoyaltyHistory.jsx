import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getMyLoyaltyTransactions,
  getPublicRewardsInfo,
} from "../services/rewardsService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function getTypeLabels(t) {
  return {
    earned: t("Earned", "अर्जित"),
    redeemed: t("Redeemed", "रिडीम किया"),
    refunded: t("Refunded", "रिफंड हुआ"),
    clawback: t("Reversed", "उलटा"),
    referral_bonus: t("Referral Bonus", "रेफरल बोनस"),
    admin_adjustment: t("Adjustment", "समायोजन"),
    expired: t("Expired", "समाप्त"),
  };
}

function LoyaltyHistory() {
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loyaltyRules, setLoyaltyRules] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/loyalty-history");
      return;
    }

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
  }, [page, isLoggedIn, navigate]);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setLoyaltyRules(response.loyalty);
    });
  }, []);

  const typeLabels = getTypeLabels(t);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        to="/account"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        {t("← Your Account", "← आपका खाता")}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {t("Points History", "पॉइंट्स हिस्ट्री")}
      </h1>

      {loyaltyRules && (
        <p className="text-sm text-slate-500 mb-6">
          {t(
            `Earn 1 point per ₹${loyaltyRules.earnRate} spent (credited on delivery). Redeem points for ₹${loyaltyRules.redeemValue} off each, up to ${Math.round(loyaltyRules.maxRedeemPercent * 100)}% of an order — minimum ${loyaltyRules.minRedeemPoints} points to redeem.`,
            `हर ₹${loyaltyRules.earnRate} खर्च पर 1 पॉइंट कमाएं (डिलीवरी पर क्रेडिट होता है)। हर पॉइंट को ₹${loyaltyRules.redeemValue} की छूट के लिए रिडीम करें, ऑर्डर के ${Math.round(loyaltyRules.maxRedeemPercent * 100)}% तक — रिडीम करने के लिए न्यूनतम ${loyaltyRules.minRedeemPoints} पॉइंट्स ज़रूरी हैं।`,
          )}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : transactions.length === 0 ? (
        <p className="text-slate-500">{t("No points activity yet.", "अभी तक कोई पॉइंट्स गतिविधि नहीं है।")}</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t("Date", "तारीख")}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("Type", "प्रकार")}</th>
                <th className="text-left px-4 py-3 font-semibold">
                  {t("Description", "विवरण")}
                </th>
                <th className="text-right px-4 py-3 font-semibold">{t("Points", "पॉइंट्स")}</th>
                <th className="text-right px-4 py-3 font-semibold">
                  {t("Balance", "बैलेंस")}
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
                    {typeLabels[tx.type] || tx.type}
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
                {t("Previous", "पिछला")}
              </button>
              <span className="text-slate-500">
                {t(`Page ${page} of ${pages}`, `पेज ${page} में से ${pages}`)}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                {t("Next", "अगला")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LoyaltyHistory;
