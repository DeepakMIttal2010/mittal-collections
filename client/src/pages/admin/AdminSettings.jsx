import { useEffect, useState } from "react";

import {
  getSiteSettingsAdmin,
  updateSiteSettings,
} from "../../services/adminSettingsService";

function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
    address: "",
    email: "",
    phone: "",
    supportHours: "",
  });

  const loadSettings = async () => {
    setLoading(true);

    const response = await getSiteSettingsAdmin();

    if (response.success) {
      setFormData({
        facebook: response.settings.facebook || "",
        instagram: response.settings.instagram || "",
        twitter: response.settings.twitter || "",
        linkedin: response.settings.linkedin || "",
        address: response.settings.address || "",
        email: response.settings.email || "",
        phone: response.settings.phone || "",
        supportHours: response.settings.supportHours || "",
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = await updateSiteSettings(formData);

    setSaving(false);

    if (response.success) {
      alert("Settings updated successfully");
    } else {
      alert(response.message || "Unable to update settings");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Site Settings
      </h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4"
      >
        <h3 className="font-semibold text-slate-800">Contact Info</h3>
        <p className="text-sm text-slate-500 -mt-2">
          Shown on the Contact page and in the site footer.
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Address
          </label>
          <textarea
            name="address"
            rows={2}
            placeholder="M-67, Mahesh Colony, Near JP Phatak Underpass, Jaipur-302015"
            value={formData.address}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Support Email
          </label>
          <input
            type="email"
            name="email"
            placeholder="info@mittalcollections.com"
            value={formData.email}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Support Phone
          </label>
          <input
            type="tel"
            name="phone"
            placeholder="+91-9711208074"
            value={formData.phone}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Support Hours
          </label>
          <input
            type="text"
            name="supportHours"
            placeholder="Mon - Sat: 11:00 - 18:00"
            value={formData.supportHours}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <hr className="border-slate-200" />

        <h3 className="font-semibold text-slate-800">Social Media Links</h3>
        <p className="text-sm text-slate-500 -mt-2">
          Shown as icons in the site footer. Leave blank to hide an icon.
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Facebook URL
          </label>
          <input
            type="url"
            name="facebook"
            placeholder="https://facebook.com/yourpage"
            value={formData.facebook}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Instagram URL
          </label>
          <input
            type="url"
            name="instagram"
            placeholder="https://instagram.com/yourpage"
            value={formData.instagram}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Twitter / X URL
          </label>
          <input
            type="url"
            name="twitter"
            placeholder="https://x.com/yourpage"
            value={formData.twitter}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            LinkedIn URL
          </label>
          <input
            type="url"
            name="linkedin"
            placeholder="https://linkedin.com/company/yourpage"
            value={formData.linkedin}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}

export default AdminSettings;
