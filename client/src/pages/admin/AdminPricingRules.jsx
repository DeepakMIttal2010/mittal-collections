import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getSiteSettingsAdmin,
  updateSiteSettings,
} from "../../services/adminSettingsService";
import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";

// Split out of AdminSettings.jsx (2026-10-14) into its own page since
// Cost/Price Auto-Fill rules are a distinct, growing admin workflow (used
// every time a product is added/edited) rather than a one-off site
// setting — admins kept having to scroll past Contact/Shipping/Bundle
// Discounts to reach it. Still saved through the same `updateSiteSettings`
// endpoint/permission ("settings"), just sending only `pricingRules` —
// that endpoint only ever touches fields actually present in the request
// body, so this page never needs to know about or resend the rest of
// SiteSettings.
function AdminPricingRules() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pricingRules, setPricingRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const loadSettings = async () => {
    setLoading(true);

    const response = await getSiteSettingsAdmin();

    if (response.success) {
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

  useEffect(() => {
    loadSettings();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const incompletePricingRule = pricingRules.some((rule) => !rule.category);

    if (incompletePricingRule) {
      alert("Pick a category for every pricing rule row (or remove it).");
      return;
    }

    setSaving(true);

    const response = await updateSiteSettings({
      pricingRules: pricingRules.map((rule) => ({
        ...rule,
        subcategory: rule.subcategory || null,
      })),
    });

    setSaving(false);

    if (response.success) {
      alert("Pricing rules updated successfully");
    } else {
      alert(response.message || "Unable to update pricing rules");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">
        Cost/Price Auto-Fill Rules
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        <Link to="/admin/settings" className="text-blue-700 hover:underline">
          ← Back to Settings
        </Link>
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl space-y-4"
      >
        <p className="text-sm text-slate-500">
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
                  min="0.1"
                  step="any"
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
                  max="99"
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

        <div>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Pricing Rules"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AdminPricingRules;
