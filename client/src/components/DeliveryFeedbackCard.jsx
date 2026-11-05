import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";

import { useLanguage } from "../context/LanguageContext";
import { submitDeliveryFeedback } from "../services/orderService";
import { dateLocale } from "../utils/dateLocale";

// Must match ISSUE_MESSAGE_MIN_LENGTH / MAX_LENGTH in
// server/utils/deliveryFeedback.js — the server checks them again.
const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

// "Did you receive your product safely?" on a delivered order. Private:
// only the customer and our team ever see the answer. `info` comes from
// the server (GET /api/orders/:id) and decides what can still be done.
function DeliveryFeedbackCard({ orderId, feedback, info, onSaved }) {
  const { t, language } = useLanguage();

  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!info?.eligible) return null;

  const response = feedback?.response || null;

  // Nothing answered and the 30 days are over — nothing to show.
  if (!response && !info.canSubmit) return null;

  const formatDate = (value) =>
    new Date(value).toLocaleDateString(dateLocale(language), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const errorText = (code) =>
    ({
      ALREADY_SUBMITTED: t(
        "Feedback for this order was already submitted.",
        "इस ऑर्डर का फ़ीडबैक पहले ही दिया जा चुका है।",
      ),
      FEEDBACK_WINDOW_CLOSED: t(
        "The feedback period for this order has ended.",
        "इस ऑर्डर के फ़ीडबैक की समय-सीमा खत्म हो गई है।",
      ),
      INVALID_MESSAGE: t(
        `Please describe the problem in ${MIN_LENGTH} to ${MAX_LENGTH} characters.`,
        `कृपया समस्या ${MIN_LENGTH} से ${MAX_LENGTH} अक्षरों में बताएं।`,
      ),
    })[code] || t("Couldn't save your feedback. Please try again.", "फ़ीडबैक सेव नहीं हो सका। कृपया फिर से कोशिश करें।");

  const send = async (body) => {
    setSubmitting(true);
    setError("");

    const result = await submitDeliveryFeedback(orderId, body);

    setSubmitting(false);

    if (result?.success) {
      setReporting(false);
      setMessage("");
      onSaved(result.deliveryFeedback, result.deliveryFeedbackInfo);
      toast.success(
        body.response === "yes"
          ? t("Thank you for letting us know!", "बताने के लिए धन्यवाद!")
          : t("Your problem has been sent to our support team.", "आपकी समस्या हमारी सपोर्ट टीम को भेज दी गई है।"),
      );
      return;
    }

    setError(errorText(result?.code));

    // Someone (another tab, a retry) already answered — show what's saved.
    if (result?.code === "ALREADY_SUBMITTED" || result?.code === "FEEDBACK_WINDOW_CLOSED") onSaved();
  };

  const handleReport = (e) => {
    e.preventDefault();

    if (message.trim().length < MIN_LENGTH) {
      setError(t(`Please write at least ${MIN_LENGTH} characters.`, `कृपया कम से कम ${MIN_LENGTH} अक्षर लिखें।`));
      return;
    }

    send({ response: "no", message: message.trim() });
  };

  const issueForm = (
    <form onSubmit={handleReport} className="mt-4">
      <label htmlFor="delivery-issue" className="block text-sm font-medium text-slate-700 mb-1">
        {t("Please tell us what went wrong", "कृपया बताएं क्या गड़बड़ हुई")}
      </label>
      <textarea
        id="delivery-issue"
        rows={3}
        maxLength={MAX_LENGTH}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t(
          "For example: the packet was torn, or an item was missing or damaged.",
          "जैसे: पैकेट फटा था, या कोई आइटम कम या खराब था।",
        )}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      <p className="text-xs text-slate-400 text-right">
        {message.length}/{MAX_LENGTH}
      </p>
      <div className="flex flex-wrap gap-3 mt-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
        >
          {submitting ? t("Sending...", "भेजा जा रहा है...") : t("Send to support", "सपोर्ट को भेजें")}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            setReporting(false);
            setError("");
          }}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
        >
          {t("Cancel", "रद्द करें")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-5 mb-6" aria-live="polite">
      {!response && (
        <>
          <h2 className="font-semibold text-slate-800">
            {t("Did you receive your product safely?", "क्या आपको आपका प्रोडक्ट सुरक्षित मिला?")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              "Your answer is private and only seen by our team.",
              "आपका जवाब निजी है और सिर्फ़ हमारी टीम देखती है।",
            )}
          </p>

          {!reporting && (
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => send({ response: "yes" })}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
              >
                {t("Yes, everything is fine", "हाँ, सब ठीक है")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setReporting(true)}
                className="border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
              >
                {t("No, I need help", "नहीं, मुझे मदद चाहिए")}
              </button>
            </div>
          )}

          {reporting && issueForm}
        </>
      )}

      {response === "yes" && (
        <>
          <p className="text-sm font-medium text-green-700">
            {t(
              "Thank you! You told us your order arrived safely.",
              "धन्यवाद! आपने बताया कि आपका ऑर्डर सुरक्षित पहुँचा।",
            )}
          </p>

          {info.canReportIssue && !reporting && (
            <p className="text-sm text-slate-600 mt-2">
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="text-blue-700 hover:underline font-medium"
              >
                {t("Found a problem later? Report it", "बाद में कोई समस्या मिली? बताएं")}
              </button>
              {info.deadline && (
                <span className="text-slate-400">
                  {" · "}
                  {t(
                    `You can report a problem until ${formatDate(info.deadline)}.`,
                    `आप ${formatDate(info.deadline)} तक समस्या बता सकते हैं।`,
                  )}
                </span>
              )}
            </p>
          )}

          {info.canReportIssue && reporting && issueForm}
        </>
      )}

      {response === "no" && (
        <>
          <p className="text-sm font-medium text-slate-800">
            {t("Problem reported — thank you for telling us.", "समस्या दर्ज हो गई — बताने के लिए धन्यवाद।")}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              "Our support team will get back to you as soon as possible.",
              "हमारी सपोर्ट टीम जल्द से जल्द आपसे संपर्क करेगी।",
            )}
          </p>
          {feedback.ticket && (
            <Link to={`/tickets/${feedback.ticket}`} className="inline-block text-sm text-blue-700 hover:underline mt-2">
              {t("View your support ticket", "अपना सपोर्ट टिकट देखें")}
            </Link>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 mt-3">
          {error}
        </p>
      )}
    </div>
  );
}

export default DeliveryFeedbackCard;
