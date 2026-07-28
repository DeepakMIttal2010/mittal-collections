import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getAllProducts,
  deleteProduct,
} from "../../services/adminProductService";

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const result = products.filter((product) =>
      product.name.toLowerCase().includes(search.toLowerCase()),
    );

    setFilteredProducts(result);
  }, [search, products]);

  const loadProducts = async () => {
    setLoading(true);

    const response = await getAllProducts();

    if (response.success) {
      setProducts(response.products);
      setFilteredProducts(response.products);
    }

    setLoading(false);
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this product?",
    );

    if (!confirmDelete) return;

    const response = await deleteProduct(id);

    if (response.success) {
      loadProducts();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading Products...</div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Manage Products</h2>

        <Link
          to="/admin/products/add"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Product
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search Product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Card Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Products Found
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredProducts.map((product) => (
            <div
              key={product._id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
            >
              {/* Image + Status badge */}
              <div className="relative">
                <img
                  src={`http://localhost:5000${product.image}`}
                  alt={product.name}
                  className="w-full h-44 object-cover"
                />

                <span
                  className={`absolute top-2 right-2 text-xs font-semibold px-2 py-1 rounded-full ${
                    product.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {product.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Details */}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-slate-800 truncate">
                  {product.name}
                </h3>

                <p className="text-sm text-slate-500 mb-2">
                  {product.category?.name || "Uncategorized"}
                </p>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-slate-900">
                    ₹{product.price}
                  </span>

                  <span
                    className={`text-sm font-medium ${
                      product.stock > 0 ? "text-slate-600" : "text-red-600"
                    }`}
                  >
                    Stock: {product.stock}
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-auto flex gap-2">
                  <Link
                    to={`/admin/products/edit/${product._id}`}
                    className="flex-1 text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    Edit
                  </Link>

                  <button
                    onClick={() => handleDelete(product._id)}
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

export default AdminProducts;
