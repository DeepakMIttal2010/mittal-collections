import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getAllCategories,
  deleteCategory,
} from "../../services/adminCategoryService";

function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const result = categories.filter((category) =>
      category.name.toLowerCase().includes(search.toLowerCase()),
    );

    setFilteredCategories(result);
  }, [search, categories]);

  const loadCategories = async () => {
    setLoading(true);

    const response = await getAllCategories();

    if (response.success) {
      setCategories(response.categories);
      setFilteredCategories(response.categories);
    }

    setLoading(false);
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

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search Category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Card Grid */}
      {filteredCategories.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Categories Found
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredCategories.map((category) => (
            <div
              key={category._id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
            >
              {/* Image + Status badge */}
              <div className="relative">
                <img
                  src={`http://localhost:5000${category.image}`}
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminCategories;
