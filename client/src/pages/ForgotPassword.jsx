import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { forgotPassword } from "../services/authService";
import { useLanguage } from "../context/LanguageContext";

function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setSent(false);

    const data = await forgotPassword(email);

    if (data.success) {
      setSent(true);
      toast.success(t("Reset link sent to your email", "रीसेट लिंक आपके ईमेल पर भेज दिया गया है"));
    } else {
      toast.error(data.message || t("Unable to send reset link", "रीसेट लिंक नहीं भेजा जा सका"));
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-3">
          {t("Reset password", "पासवर्ड रीसेट करें")}
        </h1>

        <p className="text-center text-slate-600 mb-8">
          {t(
            "We will send you an email to reset your password.",
            "हम आपके पासवर्ड को रीसेट करने के लिए आपको एक ईमेल भेजेंगे।",
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder={t("Email", "ईमेल")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-6 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? t("Submitting...", "सबमिट हो रहा है...") : t("Submit", "सबमिट करें")}
          </button>
        </form>

        {sent && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-slate-700">
            {t(
              "Check your inbox — we've emailed you a link to reset your password. It expires in 30 minutes.",
              "अपना इनबॉक्स देखें — हमने आपके पासवर्ड को रीसेट करने के लिए एक लिंक ईमेल किया है। यह 30 मिनट में समाप्त हो जाएगा।",
            )}
          </div>
        )}

        <Link
          to="/login"
          className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600 underline hover:text-amber-600"
        >
          <FaArrowLeft className="text-xs" />
          {t("Cancel", "रद्द करें")}
        </Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
