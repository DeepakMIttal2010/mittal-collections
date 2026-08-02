import { useEffect, useState } from "react";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

import {
  getAllPagesAdmin,
  createPage,
  updatePage,
  restorePage,
  deletePage,
  permanentlyDeletePage,
} from "../../services/adminPageService";

const slugify = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const FOOTER_LINKED_SLUGS = [
  "shipping-policy",
  "returns",
  "privacy-policy",
  "terms-and-conditions",
];

function AdminPages() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSlug, setEditingSlug] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({ title: "", content: "" });

  const [sortBy, setSortBy] = useState("title");
  const [sortOrder, setSortOrder] = useState("asc");

  const loadData = async () => {
    setLoading(true);

    const response = await getAllPagesAdmin({ sortBy, sortOrder });

    if (response.success) setPages(response.pages);

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

  const handleEdit = (page) => {
    setIsCreating(false);
    setEditingSlug(page.slug);
    setFormData({ title: page.title, content: page.content });
  };

  const handleAddNew = () => {
    setIsCreating(true);
    setEditingSlug(null);
    setFormData({ title: "", content: "" });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingSlug(null);
    setFormData({ title: "", content: "" });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = isCreating
      ? await createPage(formData)
      : await updatePage(editingSlug, formData);

    setSaving(false);

    if (response.success) {
      handleCancel();
      loadData();
    } else {
      alert(response.message || "Something went wrong");
    }
  };

  const handleDelete = async (page) => {
    const warning = FOOTER_LINKED_SLUGS.includes(page.slug)
      ? `"${page.title}" is linked from the site footer. Deleting it will break that link. Delete anyway?`
      : `Delete "${page.title}"?`;

    if (!window.confirm(warning)) return;

    const response = await deletePage(page.slug);

    if (response.success) {
      loadData();
    } else {
      alert(response.message || "Unable to delete page");
    }
  };

  const handleRestore = async (page) => {
    const response = await restorePage(page.slug);

    if (response.success) {
      loadData();
    } else {
      alert(response.message || "Unable to restore page");
    }
  };

  const handlePermanentDelete = async (page) => {
    if (
      !window.confirm("Permanently delete this page? This cannot be undone.")
    )
      return;

    const response = await permanentlyDeletePage(page.slug);

    if (response.success) {
      loadData();
    } else {
      alert(response.message || "Unable to permanently delete page");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">
          Site Content Pages
        </h2>

        {!editingSlug && !isCreating && (
          <button
            onClick={handleAddNew}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add New Page
          </button>
        )}
      </div>

      {editingSlug || isCreating ? (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 mb-8 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isCreating && formData.title && (
              <p className="text-xs text-slate-400 mt-1">
                Will be available at /policies/{slugify(formData.title)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Content
            </label>
            <textarea
              name="content"
              rows={10}
              value={formData.content}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Separate paragraphs with a blank line.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : isCreating ? "Create Page" : "Save"}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("title")}
                >
                  Title
                  {renderSortIcon("title")}
                </th>
                <th className="text-left px-4 py-3 font-semibold">Slug</th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("createdAt")}
                >
                  Created
                  {renderSortIcon("createdAt")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("updatedAt")}
                >
                  Last Updated
                  {renderSortIcon("updatedAt")}
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
              {pages.map((page) => (
                <tr
                  key={page._id}
                  className={`hover:bg-slate-50 ${
                    page.isActive ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {page.title}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{page.slug}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(page.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(page.updatedAt).toLocaleString("en-IN", {
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
                        page.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {page.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {page.isActive ? (
                        <>
                          <button
                            onClick={() => handleEdit(page)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(page)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(page)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(page)}
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

export default AdminPages;
