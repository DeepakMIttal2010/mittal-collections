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

const SUBJECT_OPTIONS = [
  "General Inquiry",
  "Order Support",
  "Returns & Refunds",
  "Wholesale / Bulk Orders",
  "Feedback",
  "Other",
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
    subject: SUBJECT_OPTIONS[0],
    message: "",
  });

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
      toast.success(data.message || "Message sent successfully");
      setFormData({
        name: "",
        email: "",
        mobile: "",
        subject: SUBJECT_OPTIONS[0],
        message: "",
      });
    } else {
      toast.error(data.message || "Unable to send message");
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
        url="https://mittal-collections-five.vercel.app/contact"
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        Contact Us
      </h1>
      <p className="text-slate-600">
        We&apos;d love to hear from you. Our team is here to help.
      </p>
      <p className="text-slate-600 mb-12">
        Let us know how we can help by filling out the form below.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <input
              type="text"
              name="name"
              placeholder="Name"
              value={formData.name}
              onChange={handleChange}
              required
              className={inputClass}
            />

            <input
              type="email"
              name="email"
              placeholder="Email"
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
              placeholder="Phone number"
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
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <textarea
            name="message"
            placeholder="Message"
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
            {loading ? "Sending..." : "Send message"}
          </button>
        </form>

        {/* Sidebar */}
        <div className="space-y-8">
          {settings.address && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FaMapMarkerAlt /> Address
              </h3>
              <p className="text-slate-700 whitespace-pre-line">
                {settings.address}
              </p>
            </div>
          )}

          {settings.email && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FaEnvelope /> Email
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
                <FaPhoneAlt /> Phone
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
                Follow Us
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
