import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaBell } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService";

function getTypeLabels(t) {
  return {
    order_status: t("Order Update", "ऑर्डर अपडेट"),
    ticket_reply: t("Support Reply", "सपोर्ट रिप्लाई"),
    return_status: t("Return Update", "रिटर्न अपडेट"),
    back_in_stock: t("Back in Stock", "फिर से स्टॉक में"),
    loyalty_points: t("Loyalty Points", "लॉयल्टी पॉइंट्स"),
  };
}

function Notifications() {
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    const response = await getMyNotifications();

    if (response.success) {
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/notifications");
      return;
    }

    loadNotifications();
  }, [isLoggedIn, navigate]);

  const handleClick = async (item) => {
    if (!item.isRead) {
      await markNotificationRead(item._id);
      loadNotifications();
    }
    if (item.link) navigate(item.link);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    loadNotifications();
  };

  const typeLabels = getTypeLabels(t);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Alerts", "अलर्ट")}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("Notifications", "सूचनाएं")}</h1>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            {t("Mark all as read", "सभी को पढ़ा हुआ चिह्नित करें")}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <FaBell className="text-4xl text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t("No notifications yet.", "अभी तक कोई सूचना नहीं है।")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <button
              key={item._id}
              type="button"
              onClick={() => handleClick(item)}
              className={`w-full text-left block border rounded-xl p-4 transition-all ${
                item.isRead
                  ? "border-slate-200 bg-white hover:border-blue-300"
                  : "border-blue-200 bg-blue-50/50 hover:border-blue-400"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  {typeLabels[item.type] || t("Notification", "सूचना")}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(item.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <h3 className="font-semibold text-slate-800">{item.title}</h3>
              {item.message && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {item.message}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notifications;
