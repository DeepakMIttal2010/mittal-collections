import { useEffect } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../../context/LanguageContext";
import { dateLocale } from "../../utils/dateLocale";
import { localizeSize } from "../../utils/localizeSize";
import { buildReceipt, isReceiptAvailable, receiptReference } from "../../utils/orderReceipt";
import "./OrderReceipt.css";

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Printable Order Receipt for one order, shared by the customer page
// (/my-orders/:id/receipt) and the admin page (/admin/orders/:id/receipt).
// It shows only the values saved on the order plus the seller details from
// Admin Settings. It is an informational receipt, not a tax invoice: no GST
// wording and no statutory bill number (the reference is the order number).
// Printing uses the browser's own Print / Save as PDF.
function OrderReceipt({ order, settings, backTo }) {
  const { t, language } = useLanguage();
  const isHindi = language === "hi";

  // While this page is open, printing shows only the receipt (the site
  // header, footer and floating buttons are hidden by OrderReceipt.css).
  useEffect(() => {
    document.body.classList.add("receipt-print-mode");
    return () => document.body.classList.remove("receipt-print-mode");
  }, []);

  const back = (
    <Link to={backTo} className="text-sm text-slate-600 underline hover:text-amber-600 print:hidden">
      {t("← Back to order", "← ऑर्डर पर वापस जाएं")}
    </Link>
  );

  if (!isReceiptAvailable(order)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          {t("Receipt not available", "रसीद उपलब्ध नहीं है")}
        </h1>
        <p className="text-slate-600 mb-6">
          {t("This order was cancelled, so there is no receipt for it.", "यह ऑर्डर रद्द हो गया था, इसलिए इसकी कोई रसीद नहीं है।")}
        </p>
        {back}
      </div>
    );
  }

  const r = buildReceipt(order);
  const s = settings || {};
  const proprietor = (s.proprietorName || "").trim();
  const contact = [s.email, s.phone].map((v) => (v || "").trim()).filter(Boolean).join(" · ");
  const addr = order.shippingAddress || {};
  const date = new Date(order.createdAt).toLocaleDateString(dateLocale(language), {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });

  const lineLabel = (l) => {
    switch (l.key) {
      case "itemsTotal": return t("Items total", "आइटम का कुल");
      case "coupon": return l.code ? t(`Coupon (${l.code})`, `कूपन (${l.code})`) : t("Coupon discount", "कूपन छूट");
      case "bundle": return l.percent ? t(`Bundle discount (${l.percent}%)`, `बंडल छूट (${l.percent}%)`) : t("Bundle discount", "बंडल छूट");
      case "points": return l.points ? t(`Loyalty points (${l.points})`, `लॉयल्टी पॉइंट्स (${l.points})`) : t("Loyalty points", "लॉयल्टी पॉइंट्स");
      case "delivery": return t("Delivery charge", "डिलीवरी शुल्क");
      case "cod": return t("Cash on Delivery charge", "कैश ऑन डिलीवरी शुल्क");
      default: return "";
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
        {back}
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-blue-900 hover:bg-blue-950 text-white text-sm font-semibold rounded-full px-5 py-2.5"
        >
          {t("Print / Save as PDF", "प्रिंट / PDF सेव करें")}
        </button>
      </div>

      <article className="order-receipt bg-white border border-slate-200 rounded-xl p-5 sm:p-8 text-slate-800 print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-4 mb-4">
          <p className="text-xl font-bold text-slate-900">Mittal Collections</p>
          {proprietor && <p className="text-sm">{t(`Proprietor: ${proprietor}`, `प्रोपराइटर: ${proprietor}`)}</p>}
          {s.address && <p className="text-sm whitespace-pre-line">{s.address}</p>}
          {contact && <p className="text-sm break-words">{contact}</p>}
        </header>

        <div className="flex flex-wrap justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold">{t("Order Receipt", "ऑर्डर रसीद")}</h1>
            <p className="text-sm">{t("Order", "ऑर्डर")} {receiptReference(order._id)}</p>
            <p className="text-sm">{t("Date", "तारीख")}: {date}</p>
          </div>
          <div className="text-sm sm:text-right">
            <p>{t("Payment", "भुगतान")}: {order.paymentMethod === "COD" ? t("Cash on Delivery", "कैश ऑन डिलीवरी") : t("Online (Razorpay)", "ऑनलाइन (Razorpay)")}</p>
            <p>{order.isPaid ? t("Paid", "भुगतान हो गया") : t("Not yet paid", "अभी भुगतान नहीं हुआ")}</p>
          </div>
        </div>

        <div className="text-sm mb-4">
          <p className="font-semibold">{t("Deliver to", "डिलीवरी पता")}</p>
          <p>{addr.fullName}</p>
          <p className="break-words">{[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}</p>
          {addr.mobile && <p>{addr.mobile}</p>}
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 pr-2 font-semibold">{t("Item", "आइटम")}</th>
              <th className="py-2 px-2 font-semibold text-right">{t("Qty", "मात्रा")}</th>
              <th className="py-2 px-2 font-semibold text-right">{t("Rate", "दर")}</th>
              <th className="py-2 pl-2 font-semibold text-right">{t("Amount", "राशि")}</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((item, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2 break-words">
                  {item.name}
                  {item.size && <span className="text-slate-500"> ({localizeSize(item.size, isHindi)})</span>}
                </td>
                <td className="py-2 px-2 text-right">{item.quantity}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">{rupees(item.price)}</td>
                <td className="py-2 pl-2 text-right whitespace-nowrap">{rupees(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="text-sm space-y-1 ml-auto max-w-xs">
          {r.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-4">
              <dt>{lineLabel(l)}</dt>
              <dd className="whitespace-nowrap">{l.amount < 0 ? `− ${rupees(-l.amount)}` : rupees(l.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 font-bold text-base">
            <dt>{t("Order total", "ऑर्डर का कुल")}</dt>
            <dd className="whitespace-nowrap">{rupees(r.total)}</dd>
          </div>
          {r.refunded > 0 && (
            <div className="flex justify-between gap-4 text-slate-600">
              <dt>{t("Refunded", "रिफ़ंड किया गया")}</dt>
              <dd className="whitespace-nowrap">{rupees(r.refunded)}</dd>
            </div>
          )}
        </dl>

        {!r.consistent && (
          <p className="text-xs text-slate-500 mt-3">
            {t(
              "The order total is the amount recorded when the order was placed.",
              "ऑर्डर का कुल वही राशि है जो ऑर्डर करते समय दर्ज हुई थी।",
            )}
          </p>
        )}

        <footer className="border-t border-slate-200 mt-6 pt-3 text-xs text-slate-500 space-y-1">
          <p>{t("Returns & refunds: www.mittalcollections.com/policies/returns", "रिटर्न और रिफ़ंड: www.mittalcollections.com/policies/returns")}</p>
          {contact && <p className="break-words">{t(`Questions or complaints: ${contact}`, `सवाल या शिकायत: ${contact}`)}</p>}
        </footer>
      </article>
    </div>
  );
}

export default OrderReceipt;
