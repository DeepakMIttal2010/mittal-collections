import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { resetPassword } from "../services/authService";
import { useLanguage } from "../context/LanguageContext";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match", "पासवर्ड मेल नहीं खाते"));
      return;
    }

    setLoading(true);
    const data = await resetPassword(token, password);
    setLoading(false);

    if (data.success) {
      toast.success(t("Password reset successfully", "पासवर्ड सफलतापूर्वक रीसेट हो गया"));
      navigate("/login");
    } else {
      toast.error(data.message || t("Unable to reset password", "पासवर्ड रीसेट नहीं हो सका"));
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-3">
          {t("Reset password", "पासवर्ड रीसेट करें")}
        </h1>

        <p className="text-center text-slate-600 mb-8">
          {t("Enter your new password below.", "नीचे अपना नया पासवर्ड दर्ज करें।")}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder={t("New Password", "नया पासवर्ड")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <input
            type="password"
            placeholder={t("Confirm Password", "पासवर्ड की पुष्टि करें")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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

export default ResetPassword;
