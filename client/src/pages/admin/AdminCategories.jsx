import { SERVER_URL } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaTh, FaList } from "react-icons/fa";

import {
  getAllCategories,
  restoreCategory,
  deleteCategory,
} from "../../services/adminCategoryService";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const loadCategories = async () => {
    setLoading(true);

    const response = await getAllCategories({ page, limit, search });

    if (response.success) {
      setCategories(response.categories);
      setTotal(response.total);
      setPages(response.pages);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
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

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this category?",
    );

    if (!confirmDelete) return;

    const response = await deleteCategory(id);

    if (response.success) {
      loadCategories();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreCategory(id);

    if (response.success) {
      loadCategories();
    } else {
      alert(response.message);
    }
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Manage Categories</h2>

        <Link
          to="/admin/categories/add"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Category
        </Link>
      </div>

      {/* Search + View Toggle */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search Category..."
          value={search}
          onChange={handleSearchChange}
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            className={`p-2 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <FaTh />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-label="List view"
            className={`p-2 rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <FaList />
          </button>
        </div>
      </div>

      {/* Pagination (top) */}
      {categories.length > 0 && (
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
              {total} categor{total !== 1 ? "ies" : "y"} total
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

      {categories.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Categories Found
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Image</th>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Description
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Featured
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
              {categories.map((category) => (
                <tr key={category._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <img
                      src={`${SERVER_URL}${category.image}`}
                      alt={category.name}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {category.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {category.description || "No description"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {category.featured && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                        Featured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        category.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {category.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {category.isActive ? (
                        <>
                          <Link
                            to={`/admin/categories/edit/${category._id}`}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(category._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRestore(category._id)}
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {categories.map((category) => (
            <div
              key={category._id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
            >
              {/* Image + Status badge */}
              <div className="relative">
                <img
                  src={`${SERVER_URL}${category.image}`}
                  alt={category.name}
                  className="w-full h-40 object-cover"
                />

                <span
                  className={`absolute top-2 right-2 text-xs font-semibold px-2 py-1 rounded-full ${
                    category.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {category.isActive ? "Active" : "Inactive"}
                </span>

                {category.featured && (
                  <span className="absolute top-2 left-2 text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                    Featured
                  </span>
                )}
              </div>

              {/* Details */}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-slate-800 truncate">
                  {category.name}
                </h3>

                <p className="text-sm text-slate-500 mb-3 truncate">
                  {category.description || "No description"}
                </p>

                {/* Actions */}
                <div className="mt-auto flex gap-2">
                  {category.isActive ? (
                    <>
                      <Link
                        to={`/admin/categories/edit/${category._id}`}
                        className="flex-1 text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Edit
                      </Link>

                      <button
                        onClick={() => handleDelete(category._id)}
                        className="flex-1 text-center bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestore(category._id)}
                      className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {categories.length > 0 && (
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
              {total} categor{total !== 1 ? "ies" : "y"} total
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

export default AdminCategories;
