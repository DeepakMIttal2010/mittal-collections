import { useEffect, useState } from "react";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import { imgUrl } from "../../services/api";
import { getCategories } from "../../services/categoryService";
import {
  getAllTrendingSectionsAdmin,
  addTrendingSection,
  updateTrendingSection,
  restoreTrendingSection,
  deleteTrendingSection,
  permanentlyDeleteTrendingSection,
} from "../../services/adminTrendingSectionService";

function AdminTrendingByCategory() {
  const [sections, setSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    category: "",
    displayOrder: 0,
    isActive: true,
  });

  const [sortBy, setSortBy] = useState("displayOrder");
  const [sortOrder, setSortOrder] = useState("asc");

  const loadData = async () => {
    setLoading(true);

    const [sectionsRes, categoriesRes] = await Promise.all([
      getAllTrendingSectionsAdmin({ sortBy, sortOrder }),
      getCategories(),
    ]);

    if (sectionsRes.success) setSections(sectionsRes.sections);
    if (categoriesRes.success) setCategories(categoriesRes.categories);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortBy !== field)
      return <FaSort className="inline text-slate-300 ml-1" />;
    return sortOrder === "asc" ? (
      <FaSortUp className="inline text-slate-700 ml-1" />
    ) : (
      <FaSortDown className="inline text-slate-700 ml-1" />
    );
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData({ category: "", displayOrder: 0, isActive: true });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = editingId
      ? await updateTrendingSection(editingId, formData)
      : await addTrendingSection(formData);

    setSaving(false);

    if (response.success) {
      resetForm();
      loadData();
    } else {
      alert(response.message || "Something went wrong");
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      category: item.category?._id || "",
      displayOrder: item.displayOrder,
      isActive: item.isActive,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this Top Trending section?")) return;

    const response = await deleteTrendingSection(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreTrendingSection(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (
      !window.confirm(
        "Permanently delete this section? This cannot be undone.",
      )
    )
      return;

    const response = await permanentlyDeleteTrendingSection(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  // A category that already has an active section shouldn't be offered
  // again — except the one currently being edited, which needs to keep
  // showing its own category as selected.
  const categoryOptions = categories.filter(
    (c) =>
      c._id === formData.category ||
      !sections.some((s) => s.isActive && s.category?._id === c._id),
  );

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Homepage — Top Trending by Category
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Manage which categories get their own "Top Trending" section on the
        homepage and the /trending page, and in what order. Which products
        show inside each section is still controlled by the Trending
        checkbox on that product's own Edit Product page.
      </p>

      {/* Add / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Category
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select category</option>
            {categoryOptions.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Order (Priority)
          </label>
          <input
            type="number"
            name="displayOrder"
            value={formData.displayOrder}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            checked={formData.isActive}
            onChange={handleChange}
            id="isActive"
          />
          <label htmlFor="isActive" className="text-sm text-slate-700">
            Active
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update" : "+ Add"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      {sections.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Top Trending Sections Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">
                  Category
                </th>
                <th
                  className="text-center px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("displayOrder")}
                >
                  Order
                  {renderSortIcon("displayOrder")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("createdAt")}
                >
                  Created
                  {renderSortIcon("createdAt")}
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {sections.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-3">
                      {item.category?.image && (
                        <img
                          src={imgUrl(item.category.image)}
                          alt={item.category?.name}
                          className="w-9 h-9 object-cover rounded-lg"
                        />
                      )}
                      {item.category?.name || (
                        <span className="text-red-600">
                          Category no longer exists
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.displayOrder}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {item.isActive ? (
                        <>
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(item._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(item._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-600 text-red-600 hover:bg-red-50"
                          >
                            Delete Permanently
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminTrendingByCategory;
