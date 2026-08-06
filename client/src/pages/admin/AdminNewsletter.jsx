import { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

import {
  getSubscribers,
  sendNewsletterCampaign,
  uploadCampaignImage,
} from "../../services/newsletterService";

function AdminNewsletter() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const quillRef = useRef(null);

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

  const handleImageButton = () => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const editor = quillRef.current?.getEditor();
      const range = editor?.getSelection(true);

      const response = await uploadCampaignImage(file);

      if (response.success) {
        editor.insertEmbed(range?.index ?? 0, "image", response.url);
        editor.setSelection((range?.index ?? 0) + 1);
      } else {
        alert(response.message || "Unable to upload image");
      }
    };
  };

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: handleImageButton,
        },
      },
    }),
    [],
  );

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

    const response = await sendNewsletterCampaign(subject, message);

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
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={message}
            onChange={setMessage}
            modules={modules}
            placeholder="Write your update here. Use the toolbar to add images and links."
            className="bg-white [&_.ql-editor]:min-h-[220px]"
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
