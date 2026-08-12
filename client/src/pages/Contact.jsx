import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  FaMapMarkerAlt,
  FaEnvelope,
  FaPhoneAlt,
  FaFacebookF,
  FaInstagram,
  FaTwitter,
  FaLinkedinIn,
} from "react-icons/fa";

import { submitContactMessage } from "../services/contactService";
import { getSiteSettings } from "../services/settingsService";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

const SUBJECT_OPTIONS = [
  { value: "General Inquiry", labelHi: "सामान्य पूछताछ" },
  { value: "Order Support", labelHi: "ऑर्डर सहायता" },
  { value: "Returns & Refunds", labelHi: "रिटर्न और रिफंड" },
  { value: "Wholesale / Bulk Orders", labelHi: "थोक ऑर्डर" },
  { value: "Feedback", labelHi: "फीडबैक" },
  { value: "Other", labelHi: "अन्य" },
];

const SOCIAL_ICONS = [
  { key: "facebook", icon: FaFacebookF, label: "Facebook" },
  { key: "instagram", icon: FaInstagram, label: "Instagram" },
  { key: "twitter", icon: FaTwitter, label: "Twitter" },
  { key: "linkedin", icon: FaLinkedinIn, label: "LinkedIn" },
];

function Contact() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    subject: SUBJECT_OPTIONS[0].value,
    message: "",
  });

  const { t } = useLanguage();

  useEffect(() => {
    const loadSettings = async () => {
      const data = await getSiteSettings();
      if (data.success) setSettings(data.settings);
    };

    loadSettings();
  }, []);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    const data = await submitContactMessage(formData);
    setLoading(false);

    if (data.success) {
      toast.success(data.message || t("Message sent successfully", "संदेश सफलतापूर्वक भेजा गया"));
      setFormData({
        name: "",
        email: "",
        mobile: "",
        subject: SUBJECT_OPTIONS[0].value,
        message: "",
      });
    } else {
      toast.error(data.message || t("Unable to send message", "संदेश नहीं भेजा जा सका"));
    }
  };

  const activeSocialLinks = SOCIAL_ICONS.filter((s) => settings[s.key]);
  const inputClass =
    "w-full bg-slate-100 rounded-lg px-5 py-4 outline-none text-sm text-slate-800 placeholder:text-slate-500";

  return (
    <div className="max-w-6xl mx-auto px-4 pt-16 pb-20">
      <Seo
        title="Contact Us"
        description="Get in touch with Mittal Collections for order support, returns, bulk orders or general questions about our home furnishing products."
        url="https://www.mittalcollections.com/contact"
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        {t("Contact Us", "संपर्क करें")}
      </h1>
      <p className="text-slate-600">
        {t(
          "We'd love to hear from you. Our team is here to help.",
          "हमें आपसे सुनना अच्छा लगेगा। हमारी टीम मदद के लिए यहां है।",
        )}
      </p>
      <p className="text-slate-600 mb-12">
        {t(
          "Let us know how we can help by filling out the form below.",
          "नीचे दिया गया फॉर्म भरकर हमें बताएं कि हम कैसे मदद कर सकते हैं।",
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <input
              type="text"
              name="name"
              placeholder={t("Name", "नाम")}
              value={formData.name}
              onChange={handleChange}
              required
              className={inputClass}
            />

            <input
              type="email"
              name="email"
              placeholder={t("Email", "ईमेल")}
              value={formData.email}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <input
              type="tel"
              name="mobile"
              placeholder={t("Phone number", "फोन नंबर")}
              value={formData.mobile}
              onChange={handleChange}
              className={inputClass}
            />

            <select
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className={inputClass}
            >
              {SUBJECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.value, option.labelHi)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            name="message"
            placeholder={t("Message", "संदेश")}
            rows={7}
            value={formData.message}
            onChange={handleChange}
            required
            className={`${inputClass} resize-none`}
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? t("Sending...", "भेजा जा रहा है...") : t("Send message", "संदेश भेजें")}
          </button>
        </form>

        {/* Sidebar */}
        <div className="space-y-8">
          {settings.address && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FaMapMarkerAlt /> {t("Address", "पता")}
              </h3>
              <p className="text-slate-700 whitespace-pre-line">
                {settings.address}
              </p>
            </div>
          )}

          {settings.email && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FaEnvelope /> {t("Email", "ईमेल")}
              </h3>
              <a
                href={`mailto:${settings.email}`}
                className="text-blue-700 hover:underline"
              >
                {settings.email}
              </a>
            </div>
          )}

          {settings.phone && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FaPhoneAlt /> {t("Phone", "फोन")}
              </h3>
              <a
                href={`tel:${settings.phone}`}
                className="text-blue-700 hover:underline block"
              >
                {settings.phone}
              </a>
              {settings.supportHours && (
                <p className="text-sm text-slate-500 mt-1">
                  {settings.supportHours}
                </p>
              )}
            </div>
          )}

          {activeSocialLinks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-3">
                {t("Follow Us", "हमें फॉलो करें")}
              </h3>
              <div className="flex gap-3">
                {activeSocialLinks.map(({ key, icon: Icon, label }) => (
                  <a
                    key={key}
                    href={settings[key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-amber-500 hover:text-white flex items-center justify-center text-slate-600 transition-colors"
                  >
                    <Icon className="text-sm" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Contact;
