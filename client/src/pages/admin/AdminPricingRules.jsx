import { useEffect, useMemo, useState } from "react";
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
// Sortable columns. `type` decides how values compare.
const COLUMNS = [
  { key: "category", label: "Category", type: "text" },
  { key: "subcategory", label: "Subcategory", type: "text" },
  { key: "miscExpensesPercent", label: "Misc Exps (% of Purchase)", type: "number" },
  { key: "mrpMultiplier", label: "MRP (× Purchase)", type: "number" },
  { key: "priceDiscountPercent", label: "Price (% off MRP)", type: "number" },
  { key: "isActive", label: "Active", type: "number" },
];

const NO_FILTERS = { category: "", subcategory: "", active: "" };

function AdminPricingRules() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pricingRules, setPricingRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  // View controls only: they never change the saved rules or their order.
  const [sortKeys, setSortKeys] = useState([]); // [{ key, dir }], first = primary
  const [filters, setFilters] = useState(NO_FILTERS);

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
    setFilters(NO_FILTERS);
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

  // Which rules to show and in what order. Recomputed when the sort/filter
  // controls change or a rule is added/removed -- deliberately NOT on every
  // keystroke, so editing a value in a sorted or filtered row doesn't make
  // the row jump away (or vanish) under the cursor while you type.
  const visibleRules = useMemo(() => {
    const nameOf = (list, id) => list.find((x) => x._id === id)?.name || "";
    const sortValue = (rule, key) => {
      if (key === "category") return nameOf(categories, rule.category).toLowerCase();
      if (key === "subcategory") return nameOf(subcategories, rule.subcategory).toLowerCase();
      if (key === "isActive") return rule.isActive ? 1 : 0;
      return rule[key];
    };

    const rows = pricingRules
      .map((rule, index) => ({ rule, index }))
      .filter(
        ({ rule }) =>
          (!filters.category || rule.category === filters.category) &&
          (!filters.subcategory ||
            (filters.subcategory === "__category-wide__"
              ? !rule.subcategory
              : rule.subcategory === filters.subcategory)) &&
          (!filters.active || (filters.active === "active") === !!rule.isActive),
      );

    rows.sort((a, b) => {
      for (const { key, dir } of sortKeys) {
        const x = sortValue(a.rule, key);
        const y = sortValue(b.rule, key);
        const c = typeof x === "string" ? x.localeCompare(y) : x - y;
        if (c) return dir === "asc" ? c : -c;
      }
      return a.index - b.index; // stable: original order breaks ties
    });

    // Only the ORDER is frozen. Each row's values are read fresh from state
    // at render time (see rowsToRender), otherwise typed characters would
    // not appear.
    return rows.map(({ index }) => index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKeys, filters, pricingRules.length, categories, subcategories]);

  const rowsToRender = visibleRules.map((index) => ({ rule: pricingRules[index], index }));

  // Click: sort by that column (asc, then desc, then off).
  // Shift+click: add it as another sort column (first one stays primary).
  const toggleSort = (key, additive) => {
    setSortKeys((prev) => {
      const i = prev.findIndex((k) => k.key === key);

      if (!additive) {
        if (i === 0 && prev.length === 1) {
          return prev[0].dir === "asc" ? [{ key, dir: "desc" }] : [];
        }
        return [{ key, dir: "asc" }];
      }

      if (i === -1) return [...prev, { key, dir: "asc" }];
      if (prev[i].dir === "asc") return prev.map((k, j) => (j === i ? { key, dir: "desc" } : k));
      return prev.filter((_, j) => j !== i);
    });
  };

  const setFilter = (field, value) =>
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      // A subcategory filter only makes sense inside its category.
      ...(field === "category" ? { subcategory: "" } : {}),
    }));

  const filtersActive = Object.values(filters).some(Boolean);

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
        className="bg-white border border-slate-200 rounded-xl p-6 w-full space-y-4"
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
          <div className="flex flex-wrap items-end gap-3 border border-slate-200 rounded-lg bg-slate-50 p-3">
            <label className="text-xs text-slate-600">
              <span className="block mb-1 font-semibold">Category</span>
              <select
                value={filters.category}
                onChange={(e) => setFilter("category", e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-600">
              <span className="block mb-1 font-semibold">Subcategory</span>
              <select
                value={filters.subcategory}
                onChange={(e) => setFilter("subcategory", e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All</option>
                <option value="__category-wide__">Category-wide rules only</option>
                {subcategories
                  .filter((s) => !filters.category || (s.category?._id || s.category) === filters.category)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {filters.category ? s.name : `${s.name} (${s.category?.name || ""})`}
                    </option>
                  ))}
              </select>
            </label>

            <label className="text-xs text-slate-600">
              <span className="block mb-1 font-semibold">Status</span>
              <select
                value={filters.active}
                onChange={(e) => setFilter("active", e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            {(filtersActive || sortKeys.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setSortKeys([]);
                }}
                className="text-sm text-blue-700 hover:underline pb-1.5"
              >
                Clear filters &amp; sort
              </button>
            )}

            <p className="text-xs text-slate-500 pb-1.5 ml-auto">
              Showing {visibleRules.length} of {pricingRules.length} rules. Click a column heading to
              sort; Shift+click adds a second sort column.
            </p>
          </div>
        )}

        {pricingRules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  {COLUMNS.map((col) => {
                    const position = sortKeys.findIndex((k) => k.key === col.key);
                    const active = position !== -1;
                    const dir = active ? sortKeys[position].dir : null;

                    return (
                      <th
                        key={col.key}
                        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                        className="py-2 pr-3 whitespace-nowrap"
                      >
                        <button
                          type="button"
                          onClick={(e) => toggleSort(col.key, e.shiftKey)}
                          title="Click to sort. Shift+click to add another sort column."
                          className={`inline-flex items-center gap-1 font-semibold hover:text-slate-800 ${
                            active ? "text-slate-800" : ""
                          }`}
                        >
                          {col.label}
                          <span aria-hidden="true" className={active ? "" : "text-slate-300"}>
                            {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                            {active && sortKeys.length > 1 ? position + 1 : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRules.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      No rules match these filters.
                    </td>
                  </tr>
                )}
                {rowsToRender.map(({ rule, index }) => (
                  <tr key={index}>
                    <td className="py-2 pr-3">
                      <select
                        value={rule.category}
                        onChange={(e) => {
                          handlePricingRuleChange(index, "category", e.target.value);
                          handlePricingRuleChange(index, "subcategory", "");
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Category</option>
                        {categories.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2 pr-3">
                      <select
                        value={rule.subcategory}
                        onChange={(e) =>
                          handlePricingRuleChange(index, "subcategory", e.target.value)
                        }
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    </td>

                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        aria-label="Misc Exps percent"
                        value={rule.miscExpensesPercent}
                        onChange={(e) =>
                          handlePricingRuleChange(index, "miscExpensesPercent", e.target.value)
                        }
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        aria-label="MRP multiplier"
                        value={rule.mrpMultiplier}
                        onChange={(e) =>
                          handlePricingRuleChange(index, "mrpMultiplier", e.target.value)
                        }
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        aria-label="Price discount percent"
                        value={rule.priceDiscountPercent}
                        onChange={(e) =>
                          handlePricingRuleChange(index, "priceDiscountPercent", e.target.value)
                        }
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={(e) =>
                            handlePricingRuleChange(index, "isActive", e.target.checked)
                          }
                        />
                        Active
                      </label>
                    </td>

                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemovePricingRule(index)}
                        className="text-red-500 hover:text-red-700 text-sm px-2"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
