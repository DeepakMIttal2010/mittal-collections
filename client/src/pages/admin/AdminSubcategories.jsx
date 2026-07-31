import { SERVER_URL } from "../../services/api";
import { useEffect, useState } from "react";

import { getCategories } from "../../services/categoryService";
import {
  getAllSubcategoriesAdmin,
  addSubcategory,
  updateSubcategory,
  restoreSubcategory,
  deleteSubcategory,
} from "../../services/adminSubcategoryService";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function AdminSubcategories() {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const [formData, setFormData] = useState({
    category: "",
    groupLabel: "",
    name: "",
    subtitle: "",
    displayOrder: 0,
    isActive: true,
  });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);

  const loadData = async () => {
    setLoading(true);

    const [catRes, subcatRes] = await Promise.all([
      getCategories(),
      getAllSubcategoriesAdmin({ page, limit, search }),
    ]);

    if (catRes.success) setCategories(catRes.categories);

    if (subcatRes.success) {
      setSubcategories(subcatRes.subcategories);
      setTotal(subcatRes.total);
      setPages(subcatRes.pages);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleLimitChange = (e) => {
    setLimit(Number(e.target.value));
    setPage(1);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData({
      category: "",
      groupLabel: "",
      name: "",
      subtitle: "",
      displayOrder: 0,
      isActive: true,
    });
    setImage(null);
    setPreview(null);
    setEditingId(null);
  };

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const data = new FormData();
    Object.keys(formData).forEach((key) => data.append(key, formData[key]));
    if (image) data.append("image", image);

    const response = editingId
      ? await updateSubcategory(editingId, data)
      : await addSubcategory(data);

    setSaving(false);

    if (response.success) {
      resetForm();
      loadData();
    } else {
      alert(response.message || "Something went wrong");
    }
  };

  const handleEdit = (sub) => {
    setEditingId(sub._id);
    setFormData({
      category: sub.category?._id || "",
      groupLabel: sub.groupLabel,
      name: sub.name,
      subtitle: sub.subtitle || "",
      displayOrder: sub.displayOrder,
      isActive: sub.isActive,
    });
    setImage(null);
    setPreview(sub.image ? `${SERVER_URL}${sub.image}` : null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this subcategory?")) return;

    const response = await deleteSubcategory(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreSubcategory(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading...</div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Manage Subcategories
      </h2>

      {/* Add / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Group Label
            </label>
            <input
              type="text"
              name="groupLabel"
              placeholder="e.g. By Size"
              value={formData.groupLabel}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Item Name
            </label>
            <input
              type="text"
              name="name"
              placeholder="e.g. Single"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subtitle (optional)
            </label>
            <input
              type="text"
              name="subtitle"
              placeholder={'e.g. 60" X 90"'}
              value={formData.subtitle}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Order
            </label>
            <input
              type="number"
              name="displayOrder"
              value={formData.displayOrder}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tile Image (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-slate-200"
            />
          )}

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
        </div>
      </form>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search Subcategory..."
          value={search}
          onChange={handleSearchChange}
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Pagination (top) */}
      {subcategories.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={handleLimitChange}
              className="border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-slate-400">
              {total} subcategor{total !== 1 ? "ies" : "y"} total
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-slate-600">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, pages))}
              disabled={page >= pages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {subcategories.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Subcategories Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Image</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Category
                </th>
                <th className="text-left px-4 py-3 font-semibold">
                  Group Label
                </th>
                <th className="text-left px-4 py-3 font-semibold">
                  Item Name
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Order
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
              {subcategories.map((sub) => (
                <tr key={sub._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {sub.image ? (
                      <img
                        src={`${SERVER_URL}${sub.image}`}
                        alt={sub.name}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    ) : (
                      <span className="w-12 h-12 flex items-center justify-center rounded-lg bg-slate-100 text-slate-300 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{sub.category?.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {sub.groupLabel}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {sub.name}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {sub.displayOrder}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        sub.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {sub.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {sub.isActive ? (
                        <>
                          <button
                            onClick={() => handleEdit(sub)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(sub._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRestore(sub._id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subcategories.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={handleLimitChange}
              className="border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-slate-400">
              {total} subcategor{total !== 1 ? "ies" : "y"} total
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-slate-600">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, pages))}
              disabled={page >= pages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSubcategories;
