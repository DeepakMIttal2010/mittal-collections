import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { changePassword } from "../services/authService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function ChangePassword() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/change-password");
    }
  }, [isLoggedIn, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error(t("New passwords do not match", "नए पासवर्ड मेल नहीं खाते"));
      return;
    }

    setLoading(true);
    const data = await changePassword(currentPassword, newPassword);
    setLoading(false);

    if (data.success) {
      toast.success(t("Password changed successfully", "पासवर्ड सफलतापूर्वक बदल दिया गया"));
      navigate("/account");
    } else {
      toast.error(data.message || t("Unable to change password", "पासवर्ड नहीं बदला जा सका"));
    }
  };

  const inputClass =
    "w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Change Password", "पासवर्ड बदलें")}</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        {t("Change Password", "पासवर्ड बदलें")}
      </h1>

      <form onSubmit={handleSubmit} className="max-w-md">
        <input
          type="password"
          placeholder={t("Current Password", "वर्तमान पासवर्ड")}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={inputClass}
        />

        <input
          type="password"
          placeholder={t("New Password", "नया पासवर्ड")}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className={inputClass}
        />

        <input
          type="password"
          placeholder={t("Confirm New Password", "नए पासवर्ड की पुष्टि करें")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className={`${inputClass} mb-6`}
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? t("Updating...", "अपडेट हो रहा है...") : t("Update Password", "पासवर्ड अपडेट करें")}
        </button>
      </form>
    </div>
  );
}

export default ChangePassword;
