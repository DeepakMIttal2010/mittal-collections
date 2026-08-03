import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import {
  getAllBannersAdmin,
  addBanner,
  updateBanner,
  restoreBanner,
  deleteBanner,
  permanentlyDeleteBanner,
} from "../../services/adminBannerService";

const EMPTY_FORM = {
  subtitle: "",
  title: "",
  description: "",
  button1Label: "",
  button1Link: "",
  button2Label: "",
  button2Link: "",
  displayOrder: 0,
  isActive: true,
  optimizeImages: true,
};

function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sortBy, setSortBy] = useState("displayOrder");
  const [sortOrder, setSortOrder] = useState("asc");

  const loadData = async () => {
    setLoading(true);

    const response = await getAllBannersAdmin({ sortBy, sortOrder });

    if (response.success) setBanners(response.banners);

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

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setImage(null);
    setPreview(null);
    setEditingId(null);
    setIsCreating(false);
  };

  const handleAddNew = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleEdit = (banner) => {
    setIsCreating(false);
    setEditingId(banner._id);
    setFormData({
      subtitle: banner.subtitle || "",
      title: banner.title || "",
      description: banner.description || "",
      button1Label: banner.button1Label || "",
      button1Link: banner.button1Link || "",
      button2Label: banner.button2Label || "",
      button2Link: banner.button2Link || "",
      displayOrder: banner.displayOrder || 0,
      isActive: banner.isActive,
      optimizeImages: true,
    });
    setImage(null);
    setPreview(`${imgUrl(banner.image)}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!editingId && !image) {
      alert("Please select a banner image");
      return;
    }

    setSaving(true);

    const data = new FormData();
    Object.keys(formData).forEach((key) => data.append(key, formData[key]));
    if (image) data.append("image", image);

    const response = editingId
      ? await updateBanner(editingId, data)
      : await addBanner(data);

    setSaving(false);

    if (response.success) {
      resetForm();
      loadData();
    } else {
      alert(response.message || "Something went wrong");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this banner?")) return;

    const response = await deleteBanner(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreBanner(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (
      !window.confirm("Permanently delete this banner? This cannot be undone.")
    )
      return;

    const response = await permanentlyDeleteBanner(id);

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
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Home Banners</h2>

        {!isCreating && !editingId && (
          <button
            onClick={handleAddNew}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add New Banner
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Manage the homepage hero slides. Multiple active banners rotate
        automatically. Leave a button label blank to hide that button.
      </p>

      {(isCreating || editingId) && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 mb-8 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subtitle
              </label>
              <input
                type="text"
                name="subtitle"
                placeholder="PREMIUM HOME FURNISHING"
                value={formData.subtitle}
                onChange={handleChange}
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
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title
            </label>
            <textarea
              name="title"
              rows={2}
              placeholder="Transform Every Corner&#10;of Your Home"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Press Enter for a line break.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={2}
              value={formData.description}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Button 1 Label
              </label>
              <input
                type="text"
                name="button1Label"
                placeholder="Shop Now"
                value={formData.button1Label}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Button 1 Link
              </label>
              <input
                type="text"
                name="button1Link"
                placeholder="/category/bedsheets"
                value={formData.button1Link}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Button 2 Label
              </label>
              <input
                type="text"
                name="button2Label"
                placeholder="Explore Collection"
                value={formData.button2Label}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Button 2 Link
              </label>
              <input
                type="text"
                name="button2Link"
                placeholder="#shop-categories"
                value={formData.button2Link}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Banner Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
              <input
                type="checkbox"
                name="optimizeImages"
                checked={formData.optimizeImages}
                onChange={handleChange}
                className="w-4 h-4"
              />
              Reduce image size (best quality)
            </label>
          </div>

          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="w-full max-w-md h-40 object-cover rounded-lg border border-slate-200"
            />
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              className="w-4 h-4"
            />
            Active
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create Banner"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {banners.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Banners Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Image</th>
                <th className="text-left px-4 py-3 font-semibold">Title</th>
                <th className="text-center px-4 py-3 font-semibold">Order</th>
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
              {banners.map((banner) => (
                <tr
                  key={banner._id}
                  className={`hover:bg-slate-50 ${
                    banner.isActive ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-4 py-3">
                    <img
                      src={`${imgUrl(banner.image)}`}
                      alt={banner.title}
                      className="w-20 h-12 object-cover rounded-lg"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">
                    {banner.title}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {banner.displayOrder}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(banner.createdAt).toLocaleString("en-IN", {
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
                        banner.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {banner.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {banner.isActive ? (
                        <>
                          <button
                            onClick={() => handleEdit(banner)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(banner._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(banner._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(banner._id)}
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

export default AdminBanners;
