import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getOrderById } from "../services/orderService";
import { getSiteSettings } from "../services/settingsService";
import { useLanguage } from "../context/LanguageContext";
import Seo from "../components/Seo";
import OrderReceipt from "../components/OrderReceipt/OrderReceipt";

// Customer receipt: /my-orders/:id/receipt (inside ProtectedRoute). The
// server only returns an order to its owner (or an orders-permitted admin),
// so another customer's order id just shows "not found".
function OrderReceiptPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let active = true;
    Promise.all([getOrderById(id), getSiteSettings()]).then(([orderRes, settingsRes]) => {
      if (!active) return;
      if (settingsRes?.success) setSettings(settingsRes.settings);
      if (orderRes?.success && orderRes.order) {
        setOrder(orderRes.order);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <>
      <Seo title="Order Receipt" noindex />
      {status === "loading" && <p className="text-center text-slate-500 py-16">{t("Loading...", "लोड हो रहा है...")}</p>}
      {status === "error" && (
        <p className="text-center text-slate-600 py-16">{t("Order not found.", "ऑर्डर नहीं मिला।")}</p>
      )}
      {status === "ready" && <OrderReceipt order={order} settings={settings} backTo={`/my-orders/${id}`} />}
    </>
  );
}

export default OrderReceiptPage;
