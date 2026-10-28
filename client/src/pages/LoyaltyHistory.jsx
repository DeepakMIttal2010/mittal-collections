import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getMyLoyaltyTransactions,
  getMyLoyaltySummary,
  getPublicRewardsInfo,
} from "../services/rewardsService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import Seo from "../components/Seo";
import { dateLocale } from "../utils/dateLocale";

function getTypeLabels(t) {
  return {
    earned: t("Earned", "अर्जित"),
    redeemed: t("Redeemed", "रिडीम किया"),
    refunded: t("Refunded", "रिफंड हुआ"),
    clawback: t("Reversed", "उलटा"),
    referral_bonus: t("Referral Bonus", "रेफरल बोनस"),
    admin_adjustment: t("Adjustment", "समायोजन"),
    expired: t("Expired", "समाप्त"),
    debt_recovered: t("Owed points settled", "बकाया पॉइंट्स समायोजित"),
  };
}

function getSourceLabels(t) {
  return {
    order: t("Order", "ऑर्डर"),
    referral: t("Referral", "रेफरल"),
    review: t("Review bonus", "रिव्यू बोनस"),
    pos: t("In-store purchase", "स्टोर खरीदारी"),
    admin: t("Added by store", "स्टोर द्वारा जोड़ा गया"),
    legacy: t("Earlier balance", "पुराना बैलेंस"),
    legacy_refund: t("Refund", "रिफंड"),
  };
}

function LoyaltyHistory() {
  const { isLoggedIn } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loyaltyRules, setLoyaltyRules] = useState(null);
  const [summary, setSummary] = useState(null);

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

  useEffect(() => {
    if (!isLoggedIn) return;
    getMyLoyaltySummary().then((response) => {
      if (response.success) setSummary(response.summary);
    });
  }, [isLoggedIn]);

  const typeLabels = getTypeLabels(t);
  const sourceLabels = getSourceLabels(t);
  const formatDate = (date) =>
    new Date(date).toLocaleDateString(dateLocale(language), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Seo title="Loyalty Points History" noindex />
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
            `Earn 1 point per ₹${loyaltyRules.earnRate} of products bought (delivery and COD charges don't count). Points are pending until the order's return window closes, then usable for ₹${loyaltyRules.redeemValue} off each — from 1 point, up to ${Math.round(loyaltyRules.maxRedeemPercent * 100)}% of your item total. Each batch of points is valid for ${loyaltyRules.pointsValidityDays || 365} days from the day it was credited.`,
            `हर ₹${loyaltyRules.earnRate} के प्रोडक्ट पर 1 पॉइंट कमाएं (डिलीवरी और COD चार्ज शामिल नहीं)। ऑर्डर की रिटर्न अवधि खत्म होने तक पॉइंट्स पेंडिंग रहते हैं, फिर हर पॉइंट ₹${loyaltyRules.redeemValue} की छूट देता है — 1 पॉइंट से, आइटम टोटल के ${Math.round(loyaltyRules.maxRedeemPercent * 100)}% तक। पॉइंट्स का हर बैच क्रेडिट होने के दिन से ${loyaltyRules.pointsValidityDays || 365} दिन तक मान्य है।`,
          )}
        </p>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500">{t("Available", "उपलब्ध")}</p>
              <p className="text-xl font-bold text-green-700">{summary.available}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500">{t("Pending", "पेंडिंग")}</p>
              <p className="text-xl font-bold text-amber-600">{summary.pendingTotal}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500">{t("Redeemed", "रिडीम किए")}</p>
              <p className="text-xl font-bold text-slate-800">{summary.totals.redeemed}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500">{t("Expired", "समाप्त")}</p>
              <p className="text-xl font-bold text-slate-800">{summary.totals.expired}</p>
            </div>
          </div>

          {summary.owed > 0 && (
            <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-6">
              {t(
                `${summary.owed} points are owed from a return or cancellation after those points were already used. They will be settled from your next points automatically.`,
                `${summary.owed} पॉइंट्स बकाया हैं (रिटर्न या कैंसिलेशन से पहले ही इस्तेमाल हो चुके थे)। ये आपके अगले पॉइंट्स से अपने आप समायोजित हो जाएंगे।`,
              )}
            </p>
          )}

          {summary.pending.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                {t("Pending points", "पेंडिंग पॉइंट्स")}
              </h2>
              <p className="text-xs text-slate-500 mb-2">
                {t(
                  "Pending points can't be used yet. They become available once the order's return window closes and no return is open.",
                  "पेंडिंग पॉइंट्स अभी इस्तेमाल नहीं हो सकते। ऑर्डर की रिटर्न अवधि खत्म होने और कोई रिटर्न खुला न होने पर ये उपलब्ध हो जाते हैं।",
                )}
              </p>
              <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
                {summary.pending.map((p) => (
                  <li key={p.order} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <Link to={`/my-orders/${p.order}`} className="text-blue-600 hover:underline">
                      {t("Order", "ऑर्डर")} #{String(p.order).slice(-8)}
                    </Link>
                    <span className="text-slate-600">
                      <span className="font-medium text-amber-600">{p.points}</span>{" "}
                      {p.waitingOnReturn
                        ? t("— waiting for a return to be settled", "— रिटर्न पूरा होने का इंतज़ार")
                        : t(`— available from ${formatDate(p.availableAt)}`, `— ${formatDate(p.availableAt)} से उपलब्ध`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.batches.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                {t("Your points by expiry date", "समाप्ति तिथि के अनुसार आपके पॉइंट्स")}
              </h2>
              <p className="text-xs text-slate-500 mb-2">
                {t(
                  "Points are used earliest-expiring first. Only unused points expire.",
                  "सबसे पहले खत्म होने वाले पॉइंट्स पहले इस्तेमाल होते हैं। सिर्फ़ बिना इस्तेमाल हुए पॉइंट्स समाप्त होते हैं।",
                )}
              </p>
              <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
                {summary.batches.map((batch) => (
                  <li key={batch._id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <span className="text-slate-700">
                      {sourceLabels[batch.source] || batch.source}
                      <span className="text-slate-400"> · {formatDate(batch.creditedAt)}</span>
                    </span>
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-900">{batch.remainingPoints}</span>
                      {batch.remainingPoints !== batch.originalPoints && (
                        <span className="text-slate-400"> / {batch.originalPoints}</span>
                      )}{" "}
                      {t(`valid until ${formatDate(batch.expiresAt)}`, `${formatDate(batch.expiresAt)} तक मान्य`)}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.legacyUnbatched > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  {t(
                    `${summary.legacyUnbatched} points from before batch expiry are being moved into batches.`,
                    `बैच समाप्ति से पहले के ${summary.legacyUnbatched} पॉइंट्स बैच में जोड़े जा रहे हैं।`,
                  )}
                </p>
              )}
            </section>
          )}
        </>
      )}

      <h2 className="text-lg font-semibold text-slate-900 mb-2">
        {t("Activity", "गतिविधि")}
      </h2>

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : transactions.length === 0 ? (
        <p className="text-slate-500">{t("No points activity yet.", "अभी तक कोई पॉइंट्स गतिविधि नहीं है।")}</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
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
                <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">
                  {t("Valid until", "मान्य तक")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx._id}>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatDate(tx.createdAt)}
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
                  <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                    {tx.expiresAt ? formatDate(tx.expiresAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

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
