import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaPaperPlane } from "react-icons/fa";

import {
  getTicketById,
  addTicketMessage,
  updateTicketStatus,
  markTicketSeen,
} from "../../services/ticketService";

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

const STATUS_COLORS = {
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-slate-200 text-slate-600",
};

function AdminTicketDetail() {
  const { id } = useParams();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadTicket = async () => {
    const response = await getTicketById(id);

    if (response.success) {
      setTicket(response.ticket);
      if (!response.ticket.isSeenByAdmin) markTicketSeen(id);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleReply = async (e) => {
    e.preventDefault();

    if (!reply.trim()) return;

    setSending(true);

    const response = await addTicketMessage(id, reply);

    setSending(false);

    if (response.success) {
      setTicket(response.ticket);
      setReply("");
    } else {
      alert(response.message || "Unable to send message");
    }
  };

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true);

    const response = await updateTicketStatus(id, status);

    setUpdatingStatus(false);

    if (response.success) {
      setTicket(response.ticket);
    } else {
      alert(response.message || "Unable to update status");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!ticket) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">Ticket not found.</p>
        <Link to="/admin/tickets" className="text-blue-700 hover:underline">
          ← Back to Support Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link
        to="/admin/tickets"
        className="text-sm text-blue-700 hover:underline mb-4 inline-block"
      >
        ← Support Tickets
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-800">
          {ticket.subject}
        </h2>

        <select
          value={ticket.status}
          disabled={updatingStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border-0 ${
            STATUS_COLORS[ticket.status] || "bg-slate-100 text-slate-700"
          }`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500 mb-6">
        {ticket.user?.name} · {ticket.user?.email}
        {ticket.order && (
          <>
            {" "}
            · Order{" "}
            <Link
              to={`/admin/orders?highlight=${ticket.order._id}`}
              className="text-blue-700 hover:underline"
            >
              {ticket.order._id.slice(-8)}
            </Link>
          </>
        )}
      </p>

      <div className="space-y-4 mb-8">
        {ticket.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.sender === "admin" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.sender === "admin"
                  ? "bg-blue-900 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              <p className="text-xs font-semibold mb-1 opacity-80">
                {msg.senderName} {msg.sender === "admin" && "(You)"}
              </p>
              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
              <p className="text-[11px] mt-1.5 opacity-60">
                {new Date(msg.createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type a reply..."
          className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !reply.trim()}
          className="flex items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-5 py-2.5 transition-colors disabled:opacity-50"
        >
          <FaPaperPlane className="text-xs" />
          Send
        </button>
      </form>
    </div>
  );
}

export default AdminTicketDetail;
