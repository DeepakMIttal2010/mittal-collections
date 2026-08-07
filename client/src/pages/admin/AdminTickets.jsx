import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getAllTicketsAdmin } from "../../services/ticketService";

const STATUS_TABS = ["All", "Open", "In Progress", "Resolved", "Closed"];

const STATUS_COLORS = {
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-slate-200 text-slate-600",
};

function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");

  const loadTickets = async () => {
    setLoading(true);

    const response = await getAllTicketsAdmin(
      activeTab === "All" ? undefined : activeTab,
    );

    if (response.success) setTickets(response.tickets);

    setLoading(false);
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Support Tickets
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading...</div>
      ) : tickets.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No tickets here.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket._id}
              to={`/admin/tickets/${ticket._id}`}
              className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                {!ticket.isSeenByAdmin && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">
                    {ticket.subject}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {ticket.user?.name} · {ticket.user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400">
                  {new Date(ticket.lastMessageAt).toLocaleDateString(
                    "en-IN",
                    { day: "2-digit", month: "short" },
                  )}
                </span>
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${
                    STATUS_COLORS[ticket.status] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {ticket.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminTickets;
