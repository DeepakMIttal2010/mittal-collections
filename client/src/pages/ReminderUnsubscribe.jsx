import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { optOutOfReminderEmails } from "../services/reminderEmailService";
import { useLanguage } from "../context/LanguageContext";
import Seo from "../components/Seo";

// Landing page for the "Unsubscribe from these reminders" link in cart
// reminder and wishlist price-drop emails. Same two-step pattern as
// NewsletterUnsubscribe.jsx: opening the link only shows a confirm
// button (email scanners prefetch links), the opt-out happens on the
// explicit click. The newsletter is a separate list and isn't touched.
// Messages are this page's own (EN/HI), not the server's English text.
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

function ReminderUnsubscribe() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  const token = searchParams.get("t") || "";
  const validLink = TOKEN_PATTERN.test(token);

  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const headingRef = useRef(null);

  const handleOptOut = async () => {
    setStatus("loading");
    const data = await optOutOfReminderEmails(token);
    setStatus(data.success ? "done" : "error");
  };

  // Moves focus to the result heading when the status changes, as in
  // NewsletterUnsubscribe.jsx (the clicked button unmounts).
  useEffect(() => {
    if (status === "done" || status === "error") {
      headingRef.current?.focus();
    }
  }, [status]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-16 px-4">
      {/* The token in the query string identifies the account. */}
      <Seo title="Reminder emails" noindex />
      <div className="w-full max-w-md text-center" role="status" aria-live="polite">
        {!validLink ? (
          <>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">
              {t("Invalid link", "अमान्य लिंक")}
            </h1>
            <p className="text-slate-600">
              {t(
                "This unsubscribe link looks incomplete. Please use the link from the email you received.",
                "यह अनसब्सक्राइब लिंक अधूरा लग रहा है। कृपया आपको मिले ईमेल वाला लिंक इस्तेमाल करें।",
              )}
            </p>
          </>
        ) : status === "done" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-slate-900 mb-3 outline-none">
              {t("Reminders turned off", "रिमाइंडर बंद कर दिए गए")}
            </h1>
            <p className="text-slate-600">
              {t(
                "You won't receive cart reminder or wishlist price-drop emails any more. Your newsletter subscription, if any, is unchanged. To turn reminders back on, contact us.",
                "अब आपको कार्ट रिमाइंडर और विशलिस्ट की कीमत घटने वाले ईमेल नहीं मिलेंगे। आपका न्यूज़लेटर सब्सक्रिप्शन (अगर है) वैसा ही रहेगा। रिमाइंडर दोबारा चालू करने के लिए हमसे संपर्क करें।",
              )}
            </p>
          </>
        ) : status === "error" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-slate-900 mb-3 outline-none">
              {t("Couldn't turn off reminders", "रिमाइंडर बंद नहीं हो सके")}
            </h1>
            <p className="text-slate-600">
              {t(
                "This link is invalid. Please use the link from your latest reminder email, or contact us.",
                "यह लिंक अमान्य है। कृपया अपने सबसे नए रिमाइंडर ईमेल वाला लिंक इस्तेमाल करें, या हमसे संपर्क करें।",
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">
              {t("Stop reminder emails?", "क्या रिमाइंडर ईमेल बंद करने हैं?")}
            </h1>
            <p className="text-slate-600 mb-8">
              {t(
                "This stops both cart reminder and wishlist price-drop emails. It does not change your newsletter subscription.",
                "इससे कार्ट रिमाइंडर और विशलिस्ट की कीमत घटने वाले, दोनों तरह के ईमेल बंद हो जाएँगे। आपके न्यूज़लेटर सब्सक्रिप्शन पर कोई असर नहीं पड़ेगा।",
              )}
            </p>
            <button
              type="button"
              onClick={handleOptOut}
              disabled={status === "loading"}
              className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "loading"
                ? t("Turning off...", "बंद हो रहा है...")
                : t("Yes, stop these reminders", "हां, ये रिमाइंडर बंद करें")}
            </button>
          </>
        )}

        <div className="mt-8">
          <Link to="/" className="text-sm text-slate-600 underline hover:text-amber-600">
            {t("Back to home", "होम पर वापस जाएं")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ReminderUnsubscribe;
