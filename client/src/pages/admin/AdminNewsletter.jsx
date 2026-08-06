import { useEffect, useState } from "react";

import {
  getSubscribers,
  sendNewsletterCampaign,
} from "../../services/newsletterService";

function AdminNewsletter() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const loadSubscribers = async () => {
    setLoading(true);

    const response = await getSubscribers();

    if (response.success) {
      setSubscriberCount(response.total);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSubscribers();
  }, []);

  const buildHtml = () =>
    message
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => `<p>${line}</p>`)
      .join("");

  const handleSend = async (e) => {
    e.preventDefault();

    if (!subscriberCount) {
      alert("There are no subscribers yet");
      return;
    }

    if (
      !window.confirm(
        `Send this email to all ${subscriberCount} subscribers?`,
      )
    ) {
      return;
    }

    setSending(true);

    const response = await sendNewsletterCampaign(subject, buildHtml());

    setSending(false);

    if (response.success) {
      alert(response.message);
      setSubject("");
      setMessage("");
    } else {
      alert(response.message || "Unable to send campaign");
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Newsletter</h2>
      <p className="text-sm text-slate-500 mb-6">
        {loading
          ? "Loading subscribers..."
          : `${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"} will receive this email.`}
      </p>

      <form
        onSubmit={handleSend}
        className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="New arrivals this week at Mittal Collections"
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Message
          </label>
          <textarea
            rows={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your update here. Each line becomes its own paragraph."
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={sending || loading || !subscriberCount}
          className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sending ? "Sending..." : `Send to ${subscriberCount} subscribers`}
        </button>
      </form>
    </div>
  );
}

export default AdminNewsletter;
