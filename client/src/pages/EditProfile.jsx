import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getProfile, updateProfile } from "../services/authService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function EditProfile() {
  const navigate = useNavigate();
  const { updateUser, isLoggedIn } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
  });

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/edit-profile");
      return;
    }

    const loadProfile = async () => {
      const data = await getProfile();

      if (data.success) {
        setFormData({
          name: data.user.name || "",
          email: data.user.email || "",
          mobile: data.user.mobile || "",
        });
      } else {
        toast.error(data.message || t("Unable to load profile", "प्रोफ़ाइल लोड नहीं हो सकी"));
      }

      setLoading(false);
    };

    loadProfile();
  }, [isLoggedIn, navigate, t]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);
    const data = await updateProfile(formData.name, formData.mobile);
    setSaving(false);

    if (data.success) {
      updateUser(data.user);
      toast.success(t("Profile updated successfully", "प्रोफ़ाइल सफलतापूर्वक अपडेट हो गई"));
      navigate("/account");
    } else {
      toast.error(data.message || t("Unable to update profile", "प्रोफ़ाइल अपडेट नहीं हो सकी"));
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
        <span className="text-amber-600 font-medium">{t("Edit Profile", "प्रोफ़ाइल एडिट करें")}</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">{t("Edit Profile", "प्रोफ़ाइल एडिट करें")}</h1>

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-md">
          <input
            type="text"
            name="name"
            placeholder={t("Full Name", "पूरा नाम")}
            value={formData.name}
            onChange={handleChange}
            required
            className={inputClass}
          />

          <input
            type="email"
            value={formData.email}
            disabled
            className={`${inputClass} cursor-not-allowed text-slate-400`}
          />

          <input
            type="tel"
            name="mobile"
            placeholder={t("Mobile Number", "मोबाइल नंबर")}
            value={formData.mobile}
            onChange={handleChange}
            maxLength={10}
            pattern="[0-9]{10}"
            required
            className={`${inputClass} mb-6`}
          />

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? t("Saving...", "सेव हो रहा है...") : t("Save Changes", "बदलाव सेव करें")}
          </button>
        </form>
      )}
    </div>
  );
}

export default EditProfile;
