import { useEffect, useState } from "react";

import { imgUrl } from "../../services/api";
import {
  getAllCategories,
  updateCategory,
} from "../../services/adminCategoryService";

// Lets an admin pick which categories get their own "New Arrivals"
// section on the homepage (Category.showInHomeNewArrivals) — off by
// default per category, so the homepage only shows sections the admin
// has deliberately opted into instead of one for every category.
function AdminNewArrivalsSections() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const loadCategories = async () => {
    setLoading(true);

    const response = await getAllCategories({ limit: 100, sortBy: "displayOrder", sortOrder: "asc" });

    if (response.success) {
      setCategories(response.categories);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleToggle = async (category) => {
    const nextValue = !category.showInHomeNewArrivals;

    setSavingId(category._id);
    setCategories((prev) =>
      prev.map((c) =>
        c._id === category._id
          ? { ...c, showInHomeNewArrivals: nextValue }
          : c,
      ),
    );

    const formData = new FormData();
    formData.append("showInHomeNewArrivals", nextValue);

    const response = await updateCategory(category._id, formData);

    if (!response.success) {
      // Revert on failure — don't leave the toggle showing a state that
      // never actually saved.
      setCategories((prev) =>
        prev.map((c) =>
          c._id === category._id
            ? { ...c, showInHomeNewArrivals: !nextValue }
            : c,
        ),
      );
      alert(response.message || "Unable to update category");
    }

    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading Categories...
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">
          Homepage — New Arrivals by Category
        </h2>
        <p className="text-slate-500 mt-1">
          Turn on a category here to give it its own "New Arrivals" section
          on the homepage, showing that category's newest products. Off by
          default — the homepage only shows sections for categories you
          enable below.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Categories Found
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {categories.map((category) => (
            <div
              key={category._id}
              className="flex items-center gap-4 px-5 py-4"
            >
              <img
                src={imgUrl(category.image)}
                alt={category.name}
                className="w-12 h-12 object-cover rounded-lg shrink-0"
              />

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 truncate">
                  {category.name}
                </h3>
                {!category.isActive && (
                  <span className="text-xs font-semibold text-red-600">
                    Inactive category
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer shrink-0">
                <span className="w-16 text-right">
                  {category.showInHomeNewArrivals ? "Showing" : "Hidden"}
                </span>
                <span className="relative inline-block w-11 h-6">
                  <input
                    type="checkbox"
                    checked={!!category.showInHomeNewArrivals}
                    disabled={savingId === category._id}
                    onChange={() => handleToggle(category)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors peer-disabled:opacity-50" />
                  <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminNewArrivalsSections;
