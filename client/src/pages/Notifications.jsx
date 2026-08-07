import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaBell } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService";

const TYPE_LABELS = {
  order_status: "Order Update",
  ticket_reply: "Support Reply",
  return_status: "Return Update",
  back_in_stock: "Back in Stock",
  loyalty_points: "Loyalty Points",
};

function Notifications() {
  const { isLoggedIn } = useAuth();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <FaBell className="text-4xl text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No notifications yet.</p>
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
                  {TYPE_LABELS[item.type] || "Notification"}
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
