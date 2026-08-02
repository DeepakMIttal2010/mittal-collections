import { useEffect, useState } from "react";
import { FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";

import {
  getMessages,
  markAsRead,
  deleteMessage,
} from "../../services/adminContactService";

function AdminMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [sortOrder, setSortOrder] = useState("desc");

  const loadData = async () => {
    setLoading(true);

    const response = await getMessages({ sortOrder });

    if (response.success) setMessages(response.messages);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  const handleExpand = async (item) => {
    const nextId = expandedId === item._id ? null : item._id;
    setExpandedId(nextId);

    if (nextId && !item.isRead) {
      await markAsRead(item._id);
      loadData();
    }
  };

  const handleCopyEmail = async (email, id) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      alert(email);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this message?")) return;

    const response = await deleteMessage(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">
          Contact Messages
        </h2>

        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
          }
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
        >
          {sortOrder === "desc" ? (
            <FaSortAmountDown className="text-xs" />
          ) : (
            <FaSortAmountUp className="text-xs" />
          )}
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Messages Yet
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((item) => (
            <div
              key={item._id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => handleExpand(item)}
                className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {!item.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {item.subject} — {item.name}
                    </p>
                    <p className="text-sm text-slate-500 truncate">
                      {item.email}
                    </p>
                  </div>
                </div>

                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(item.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </button>

              {expandedId === item._id && (
                <div className="border-t border-slate-100 p-4 bg-slate-50">
                  {item.mobile && (
                    <p className="text-sm text-slate-600 mb-2">
                      Phone: {item.mobile}
                    </p>
                  )}
                  <p className="text-sm text-slate-700 whitespace-pre-line mb-4">
                    {item.message}
                  </p>

                  <div className="flex gap-2">
                    <a
                      href={`mailto:${item.email}?subject=${encodeURIComponent(
                        `Re: ${item.subject}`,
                      )}&body=${encodeURIComponent(`Hi ${item.name},\n\n`)}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Reply by Email
                    </a>
                    <button
                      onClick={() => handleCopyEmail(item.email, item._id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700"
                    >
                      {copiedId === item._id ? "Copied!" : "Copy Email"}
                    </button>
                    <button
                      onClick={() => handleDelete(item._id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminMessages;
