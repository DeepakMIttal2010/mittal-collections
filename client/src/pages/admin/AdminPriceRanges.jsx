import { useEffect, useState } from "react";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import {
  getAllPriceRangesAdmin,
  addPriceRange,
  updatePriceRange,
  restorePriceRange,
  deletePriceRange,
  permanentlyDeletePriceRange,
} from "../../services/adminPriceRangeService";

function AdminPriceRanges() {
  const [priceRanges, setPriceRanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    label: "",
    maxPrice: "",
    displayOrder: 0,
    isActive: true,
  });

  const [sortBy, setSortBy] = useState("displayOrder");
  const [sortOrder, setSortOrder] = useState("asc");

  const loadData = async () => {
    setLoading(true);

    const response = await getAllPriceRangesAdmin({ sortBy, sortOrder });

    if (response.success) setPriceRanges(response.priceRanges);

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
    setFormData({ label: "", maxPrice: "", displayOrder: 0, isActive: true });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = editingId
      ? await updatePriceRange(editingId, formData)
      : await addPriceRange(formData);

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
      label: item.label,
      maxPrice: item.maxPrice,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this price range?")) return;

    const response = await deletePriceRange(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restorePriceRange(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (
      !window.confirm(
        "Permanently delete this price range? This cannot be undone.",
      )
    )
      return;

    const response = await permanentlyDeletePriceRange(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Shop by Price
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Manage the price-range tiles shown on the homepage. Products priced
        at or below the max price will appear when a customer clicks a tile.
      </p>

      {/* Add / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Label
          </label>
          <input
            type="text"
            name="label"
            placeholder="Under ₹599"
            value={formData.label}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Max Price (₹)
          </label>
          <input
            type="number"
            name="maxPrice"
            min="0"
            value={formData.maxPrice}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
      {priceRanges.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Price Ranges Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Label</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Max Price
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Order
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
              {priceRanges.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.label}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    ₹{item.maxPrice}
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

export default AdminPriceRanges;
