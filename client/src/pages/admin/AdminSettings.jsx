import { useEffect, useState } from "react";

import {
  getSiteSettingsAdmin,
  updateSiteSettings,
} from "../../services/adminSettingsService";
import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import WelcomeBenefitsPopup from "../../components/WelcomeBenefitsPopup";

function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [showPopupPreview, setShowPopupPreview] = useState(false);
  const [showRegisteredPopupPreview, setShowRegisteredPopupPreview] =
    useState(false);
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
    freeShippingThreshold: 499,
    deliveryFee: 49,
    codCharge: 50,
    defaultReturnPeriodDays: 7,
    welcomePopupEnabled: true,
  });

  const [shippingTiers, setShippingTiers] = useState([]);
  const [bundleRules, setBundleRules] = useState([]);
  const [pricingRules, setPricingRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

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
        freeShippingThreshold: response.settings.freeShippingThreshold ?? 499,
        deliveryFee: response.settings.deliveryFee ?? 49,
        codCharge: response.settings.codCharge ?? 50,
        defaultReturnPeriodDays:
          response.settings.defaultReturnPeriodDays ?? 7,
        welcomePopupEnabled: response.settings.welcomePopupEnabled ?? true,
      });
      setShippingTiers(response.settings.shippingTiers || []);
      setBundleRules(
        (response.settings.bundleRules || []).map((rule) => ({
          categoryA: rule.categoryA?._id || rule.categoryA || "",
          categoryB: rule.categoryB?._id || rule.categoryB || "",
          discountPercent: rule.discountPercent,
          isActive: rule.isActive,
        })),
      );
      setPricingRules(
        (response.settings.pricingRules || []).map((rule) => ({
          category: rule.category?._id || rule.category || "",
          subcategory: rule.subcategory?._id || rule.subcategory || "",
          miscExpensesPercent: rule.miscExpensesPercent,
          mrpMultiplier: rule.mrpMultiplier,
          priceDiscountPercent: rule.priceDiscountPercent,
          isActive: rule.isActive,
        })),
      );
    }

    const categoriesRes = await getCategories();
    if (categoriesRes.success) setCategories(categoriesRes.categories);

    const subcategoriesRes = await getSubcategories();
    if (subcategoriesRes.success) setSubcategories(subcategoriesRes.subcategories);

    setLoading(false);
  };

  const handleTierChange = (index, field, value) => {
    setShippingTiers((prev) =>
      prev.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) } : tier,
      ),
    );
  };

  const handleAddTier = () => {
    setShippingTiers((prev) => [...prev, { maxOrderValue: 0, fee: 0 }]);
  };

  const handleRemoveTier = (index) => {
    setShippingTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBundleRuleChange = (index, field, value) => {
    setBundleRules((prev) =>
      prev.map((rule, i) =>
        i === index
          ? {
              ...rule,
              [field]: field === "discountPercent" ? Number(value) : value,
            }
          : rule,
      ),
    );
  };

  const handleAddBundleRule = () => {
    setBundleRules((prev) => [
      ...prev,
      { categoryA: "", categoryB: "", discountPercent: 10, isActive: true },
    ]);
  };

  const handleRemoveBundleRule = (index) => {
    setBundleRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePricingRuleChange = (index, field, value) => {
    setPricingRules((prev) =>
      prev.map((rule, i) =>
        i === index
          ? {
              ...rule,
              [field]:
                field === "category" || field === "subcategory"
                  ? value
                  : Number(value),
            }
          : rule,
      ),
    );
  };

  const handleAddPricingRule = () => {
    setPricingRules((prev) => [
      ...prev,
      {
        category: "",
        subcategory: "",
        miscExpensesPercent: 10,
        mrpMultiplier: 2,
        priceDiscountPercent: 15,
        isActive: true,
      },
    ]);
  };

  const handleRemovePricingRule = (index) => {
    setPricingRules((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? checked : type === "number" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const incompleteBundleRule = bundleRules.some(
      (rule) => !rule.categoryA || !rule.categoryB,
    );

    if (incompleteBundleRule) {
      alert("Pick both categories for every bundle discount row (or remove it).");
      return;
    }

    const incompletePricingRule = pricingRules.some((rule) => !rule.category);

    if (incompletePricingRule) {
      alert("Pick a category for every pricing rule row (or remove it).");
      return;
    }

    setSaving(true);

    const response = await updateSiteSettings({
      ...formData,
      shippingTiers,
      bundleRules,
      pricingRules: pricingRules.map((rule) => ({
        ...rule,
        subcategory: rule.subcategory || null,
      })),
    });

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

        <h3 className="font-semibold text-slate-800">Shipping</h3>
        <p className="text-sm text-slate-500 -mt-2">
          Controls the delivery fee and free-shipping threshold shown at
          checkout.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Delivery Fee (₹)
            </label>
            <input
              type="number"
              name="deliveryFee"
              min="0"
              value={formData.deliveryFee}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used when no tier below matches an order.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Free Shipping Above (₹)
            </label>
            <input
              type="number"
              name="freeShippingThreshold"
              min="0"
              value={formData.freeShippingThreshold}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            COD Charge (₹)
          </label>
          <input
            type="number"
            name="codCharge"
            min="0"
            value={formData.codCharge}
            onChange={handleChange}
            className="w-full sm:w-1/2 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Added on top of the order total for Cash on Delivery only — meant
            to pass through the actual courier's COD handling fee, not a
            markup. Never applied to Razorpay orders.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Graduated Fee Tiers (optional)
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Charge a smaller fee as the order gets closer to free shipping —
            e.g. ₹49 for orders under ₹99, ₹19 for orders under ₹399.
          </p>

          {shippingTiers.length > 0 && (
            <div className="space-y-2 mb-2">
              {shippingTiers.map((tier, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 shrink-0">
                    Order below ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={tier.maxOrderValue}
                    onChange={(e) =>
                      handleTierChange(index, "maxOrderValue", e.target.value)
                    }
                    className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-500 shrink-0">
                    → fee ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={tier.fee}
                    onChange={(e) =>
                      handleTierChange(index, "fee", e.target.value)
                    }
                    className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTier(index)}
                    className="text-red-500 hover:text-red-700 text-sm px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleAddTier}
            className="text-sm text-blue-700 hover:text-blue-900 font-medium"
          >
            + Add Tier
          </button>
        </div>

        <hr className="border-slate-200" />

        <h3 className="font-semibold text-slate-800">Bundle Discounts</h3>
        <p className="text-sm text-slate-500 -mt-2">
          "Complete the Look" — buying from both categories in a rule
          unlocks that discount automatically at checkout, no coupon
          needed.
        </p>

        {bundleRules.length > 0 && (
          <div className="space-y-2 mb-2">
            {bundleRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2 flex-wrap">
                <select
                  value={rule.categoryA}
                  onChange={(e) =>
                    handleBundleRuleChange(index, "categoryA", e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Category A</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <span className="text-xs text-slate-500 shrink-0">+</span>

                <select
                  value={rule.categoryB}
                  onChange={(e) =>
                    handleBundleRuleChange(index, "categoryB", e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Category B</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <span className="text-xs text-slate-500 shrink-0">→</span>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={rule.discountPercent}
                  onChange={(e) =>
                    handleBundleRuleChange(
                      index,
                      "discountPercent",
                      e.target.value,
                    )
                  }
                  className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-500 shrink-0">%</span>

                <label className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={(e) =>
                      handleBundleRuleChange(
                        index,
                        "isActive",
                        e.target.checked,
                      )
                    }
                  />
                  Active
                </label>

                <button
                  type="button"
                  onClick={() => handleRemoveBundleRule(index)}
                  className="text-red-500 hover:text-red-700 text-sm px-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddBundleRule}
          className="text-sm text-blue-700 hover:text-blue-900 font-medium"
        >
          + Add Bundle Rule
        </button>

        <hr className="border-slate-200" />

        <h3 className="font-semibold text-slate-800">Cost/Price Auto-Fill Rules</h3>
        <p className="text-sm text-slate-500 -mt-2">
          Controls the Add/Edit Product form's auto-fill: admin enters
          Purchase Price, and Misc Exps / MRP / Selling Price are
          suggested from it — Misc Exps = Purchase Price × %, MRP =
          Purchase Price × multiplier, Price = MRP − %. A subcategory
          rule overrides its category's rule. Admin can still edit any
          suggested value by hand afterwards.
        </p>

        {pricingRules.length > 0 && (
          <div className="space-y-2 mb-2">
            {pricingRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2 flex-wrap">
                <select
                  value={rule.category}
                  onChange={(e) => {
                    handlePricingRuleChange(index, "category", e.target.value);
                    handlePricingRuleChange(index, "subcategory", "");
                  }}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={rule.subcategory}
                  onChange={(e) =>
                    handlePricingRuleChange(index, "subcategory", e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All subcategories</option>
                  {subcategories
                    .filter(
                      (s) =>
                        (s.category?._id || s.category) === rule.category,
                    )
                    .map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                </select>

                <span className="text-xs text-slate-500 shrink-0">
                  Misc Exps
                </span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={rule.miscExpensesPercent}
                  onChange={(e) =>
                    handlePricingRuleChange(
                      index,
                      "miscExpensesPercent",
                      e.target.value,
                    )
                  }
                  className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-500 shrink-0">%</span>

                <span className="text-xs text-slate-500 shrink-0">
                  MRP ×
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={rule.mrpMultiplier}
                  onChange={(e) =>
                    handlePricingRuleChange(
                      index,
                      "mrpMultiplier",
                      e.target.value,
                    )
                  }
                  className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <span className="text-xs text-slate-500 shrink-0">
                  Price = MRP −
                </span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={rule.priceDiscountPercent}
                  onChange={(e) =>
                    handlePricingRuleChange(
                      index,
                      "priceDiscountPercent",
                      e.target.value,
                    )
                  }
                  className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-500 shrink-0">%</span>

                <label className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={(e) =>
                      handlePricingRuleChange(
                        index,
                        "isActive",
                        e.target.checked,
                      )
                    }
                  />
                  Active
                </label>

                <button
                  type="button"
                  onClick={() => handleRemovePricingRule(index)}
                  className="text-red-500 hover:text-red-700 text-sm px-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddPricingRule}
          className="text-sm text-blue-700 hover:text-blue-900 font-medium"
        >
          + Add Pricing Rule
        </button>

        <hr className="border-slate-200" />

        <h3 className="font-semibold text-slate-800">Welcome Popup</h3>
        <p className="text-sm text-slate-500 -mt-2">
          The "Welcome to Mittal Collections" benefits popup shown to
          first-time guests (hidden for logged-in customers, and won't
          reappear for 24 hours after being shown). The toggle below only
          controls this guest version — the "🎉 Registration Successful!"
          variant shown right after a new signup always fires, since it's
          a one-time confirmation rather than a repeat marketing nudge.
        </p>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="welcomePopupEnabled"
              checked={formData.welcomePopupEnabled}
              onChange={handleChange}
            />
            Show the welcome popup to new visitors
          </label>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowPopupPreview(true)}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              Preview Popup
            </button>

            <button
              type="button"
              onClick={() => setShowRegisteredPopupPreview(true)}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              Preview After-Registration Popup
            </button>
          </div>
        </div>

        <hr className="border-slate-200" />

        <h3 className="font-semibold text-slate-800">Returns</h3>
        <p className="text-sm text-slate-500 -mt-2">
          Default return window for products that don't set their own
          custom period.
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default Return Period (days)
          </label>
          <input
            type="number"
            name="defaultReturnPeriodDays"
            min="0"
            value={formData.defaultReturnPeriodDays}
            onChange={handleChange}
            className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {showPopupPreview && (
        <WelcomeBenefitsPopup
          previewMode
          onClose={() => setShowPopupPreview(false)}
        />
      )}

      {showRegisteredPopupPreview && (
        <WelcomeBenefitsPopup
          previewMode
          previewCelebrate
          onClose={() => setShowRegisteredPopupPreview(false)}
        />
      )}
    </div>
  );
}

export default AdminSettings;
