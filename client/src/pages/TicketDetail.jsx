import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FaPaperPlane } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getTicketById, addTicketMessage } from "../services/ticketService";

const STATUS_COLORS = {
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-slate-200 text-slate-600",
};

function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadTicket = async () => {
    const response = await getTicketById(id);

    if (response.success) setTicket(response.ticket);

    setLoading(false);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      navigate(`/login?redirect=/tickets/${id}`);
      return;
    }

    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isLoggedIn, navigate]);

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
      toast.error(response.message || "Unable to send message");
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-500">
        Loading...
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-500 mb-4">Ticket not found.</p>
        <Link to="/tickets" className="text-blue-700 hover:underline">
          ← Back to Support Tickets
        </Link>
      </div>
    );
  }

  const isClosed = ticket.status === "Resolved" || ticket.status === "Closed";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <Link to="/tickets" className="text-blue-700 hover:underline">
          Support Tickets
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{ticket.subject}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {ticket.subject}
        </h1>
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full ${
            STATUS_COLORS[ticket.status] || "bg-slate-100 text-slate-700"
          }`}
        >
          {ticket.status}
        </span>
      </div>

      {ticket.order && (
        <p className="text-sm text-slate-500 mb-6">
          Related to order{" "}
          <Link
            to={`/my-orders/${ticket.order._id}`}
            className="text-blue-700 hover:underline"
          >
            {ticket.order._id.slice(-8)}
          </Link>
        </p>
      )}

      <div className="space-y-4 mb-8">
        {ticket.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.sender === "admin" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.sender === "admin"
                  ? "bg-slate-100 text-slate-800"
                  : "bg-blue-900 text-white"
              }`}
            >
              <p className="text-xs font-semibold mb-1 opacity-80">
                {msg.senderName} {msg.sender === "admin" && "(Support)"}
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

      {isClosed && (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-4">
          This ticket is {ticket.status.toLowerCase()}. Sending a message will
          reopen it.
        </p>
      )}

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

export default TicketDetail;
