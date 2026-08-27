import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FaPlus, FaTicketAlt } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getMyTickets, createTicket } from "../services/ticketService";
import { getMyOrders } from "../services/orderService";

const STATUS_COLORS = {
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-slate-200 text-slate-600",
};

function getStatusLabel(t, status) {
  return {
    Open: t("Open", "खुला"),
    "In Progress": t("In Progress", "प्रगति में"),
    Resolved: t("Resolved", "हल हो गया"),
    Closed: t("Closed", "बंद"),
  }[status] || status;
}

function Tickets() {
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedOrder = searchParams.get("order") || "";

  const [tickets, setTickets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(Boolean(preselectedOrder));
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState(
    preselectedOrder ? t("Issue with my order", "मेरे ऑर्डर में समस्या") : "",
  );
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState(preselectedOrder);

  const loadTickets = async () => {
    const response = await getMyTickets();

    if (response.success) setTickets(response.tickets);

    setLoading(false);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/tickets");
      return;
    }

    loadTickets();
    getMyOrders().then((response) => {
      if (response?.success) setOrders(response.orders);
    });
  }, [isLoggedIn, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!subject.trim() || !message.trim()) {
      toast.error(t("Please fill in both subject and message", "कृपया विषय और संदेश दोनों भरें"));
      return;
    }

    setSubmitting(true);

    const response = await createTicket({
      subject,
      message,
      order: orderId || undefined,
    });

    setSubmitting(false);

    if (response.success) {
      toast.success(t("Ticket submitted — we'll get back to you soon", "टिकट सबमिट हो गई — हम जल्द ही आपसे संपर्क करेंगे"));
      setSubject("");
      setMessage("");
      setOrderId("");
      setShowForm(false);
      loadTickets();
    } else {
      toast.error(response.message || t("Unable to submit ticket", "टिकट सबमिट नहीं हो सकी"));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Support Tickets", "सपोर्ट टिकट")}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("Support Tickets", "सपोर्ट टिकट")}</h1>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-5 py-2.5 transition-colors"
        >
          <FaPlus className="text-xs" />
          {t("New Ticket", "नई टिकट")}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-200 rounded-xl p-5 mb-8 bg-white space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("Subject", "विषय")}
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("e.g. My order hasn't arrived", "जैसे: मेरा ऑर्डर नहीं पहुंचा")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {orders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("Related order (optional)", "संबंधित ऑर्डर (वैकल्पिक)")}
              </label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("None", "कोई नहीं")}</option>
                {orders.map((order) => (
                  <option key={order._id} value={order._id}>
                    {t("Order ", "ऑर्डर ")}{order._id.slice(-8)} — ₹{order.totalPrice} (
                    {order.orderStatus})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("Message", "संदेश")}
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("Describe your issue...", "अपनी समस्या बताएं...")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-900 hover:bg-blue-950 text-white font-medium px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            {submitting ? t("Submitting...", "सबमिट हो रहा है...") : t("Submit Ticket", "टिकट सबमिट करें")}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <FaTicketAlt className="text-4xl text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {t("You haven't raised any support tickets yet.", "आपने अभी तक कोई सपोर्ट टिकट नहीं उठाई है।")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket._id}
              to={`/tickets/${ticket._id}`}
              className="block border border-slate-200 rounded-xl p-4 bg-white hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="font-semibold text-slate-800">
                  {ticket.subject}
                </h3>
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${
                    STATUS_COLORS[ticket.status] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {getStatusLabel(t, ticket.status)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {t("Last updated ", "आखिरी बार अपडेट हुआ ")}
                {new Date(ticket.lastMessageAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Tickets;
