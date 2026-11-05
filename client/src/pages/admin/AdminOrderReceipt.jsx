import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getOrderById } from "../../services/adminOrderService";
import { getSiteSettings } from "../../services/settingsService";
import OrderReceipt from "../../components/OrderReceipt/OrderReceipt";

// Admin receipt: /admin/orders/:id/receipt — print and put it in the
// parcel. Same receipt as the customer sees; the server allows it for
// admins with the "orders" permission.
function AdminOrderReceipt() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [status, setStatus] = useState("loading");

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

  if (status === "loading") return <p className="text-center text-slate-500 py-16">Loading...</p>;
  if (status === "error") return <p className="text-center text-slate-600 py-16">Order not found.</p>;
  return <OrderReceipt order={order} settings={settings} backTo="/admin/orders" />;
}

export default AdminOrderReceipt;
