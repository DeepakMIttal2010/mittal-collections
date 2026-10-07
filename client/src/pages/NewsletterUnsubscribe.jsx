import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { unsubscribeFromNewsletter } from "../services/newsletterService";
import { useLanguage } from "../context/LanguageContext";
import Seo from "../components/Seo";

// A plain GET link would let an email client's link-preview/malware
// scanner (which prefetches every URL in an email) silently unsubscribe
// someone before they ever open the page — a known real gotcha with
// one-click GET unsubscribe links. Landing here just shows a confirm
// button; the actual unsubscribe only happens on that explicit click
// (a POST), not on page load.
function NewsletterUnsubscribe() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");
  const headingRef = useRef(null);

  const handleUnsubscribe = async () => {
    setStatus("loading");
    const data = await unsubscribeFromNewsletter(email, token);
    setStatus(data.success ? "done" : "error");
    setMessage(data.message || "");
  };

  // Moves focus to the result heading whenever the status changes so a
  // screen-reader user (whose activated button just unmounted) is told
  // what happened instead of losing focus to <body> with no announcement.
  useEffect(() => {
    if (status === "done" || status === "error") {
      headingRef.current?.focus();
    }
  }, [status]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-16 px-4">
      {/* Carries the subscriber's email + a signed token in the query
          string — same noindex reasoning as ResetPassword.jsx's token
          URL. */}
      <Seo title="Unsubscribe" noindex />
      <div
        className="w-full max-w-md text-center"
        role="status"
        aria-live="polite"
      >
        {!email || !token ? (
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
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-bold text-slate-900 mb-3 outline-none"
            >
              {t("You're unsubscribed", "आप अनसब्सक्राइब हो गए हैं")}
            </h1>
            <p className="text-slate-600">
              {t(
                "You won't receive any more newsletter emails from Mittal Collections.",
                "अब आपको Mittal Collections की ओर से कोई न्यूज़लेटर ईमेल नहीं मिलेगा।",
              )}
            </p>
          </>
        ) : status === "error" ? (
          <>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-bold text-slate-900 mb-3 outline-none"
            >
              {t("Couldn't unsubscribe", "अनसब्सक्राइब नहीं हो सका")}
            </h1>
            <p className="text-slate-600">
              {message ||
                t(
                  "This link is invalid or has already been used.",
                  "यह लिंक अमान्य है या पहले ही इस्तेमाल हो चुका है।",
                )}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">
              {t("Unsubscribe from our newsletter?", "क्या हमारे न्यूज़लेटर से अनसब्सक्राइब करना है?")}
            </h1>
            <p className="text-slate-600 mb-8 break-all">{email}</p>
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={status === "loading"}
              className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "loading"
                ? t("Unsubscribing...", "अनसब्सक्राइब हो रहा है...")
                : t("Yes, unsubscribe me", "हां, मुझे अनसब्सक्राइब करें")}
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

export default NewsletterUnsubscribe;
