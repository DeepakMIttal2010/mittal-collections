import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaTh,
  FaList,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaFileExcel,
  FaWhatsapp,
} from "react-icons/fa";

import {
  getAllProducts,
  restoreProduct,
  deleteProduct,
  permanentlyDeleteProduct,
  duplicateProduct,
} from "../../services/adminProductService";
import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import ProductQuickView from "../../components/admin/ProductQuickView";
import ShareProductModal from "../../components/admin/ShareProductModal";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const OPTIONAL_COLUMNS = [
  { key: "featured", label: "Featured" },
  { key: "isReturnable", label: "Returnable" },
  { key: "isTrending", label: "Trending" },
  { key: "restockAlertEnabled", label: "Restock Alert" },
  { key: "willRestock", label: "Will Restock" },
  { key: "visibility", label: "Show Product" },
];

const VISIBILITY_LABELS = {
  both: "Online & Offline",
  online: "Online Only",
  offline: "Offline Only",
};

function AdminProducts() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [shareProduct, setShareProduct] = useState(null);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [visibleColumns, setVisibleColumns] = useState({
    featured: false,
    isReturnable: false,
    isTrending: false,
    restockAlertEnabled: false,
    willRestock: false,
    visibility: true,
  });

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  // Remembered for the browser tab's session — so navigating away to edit
  // a product and back doesn't lose the category/subcategory you'd
  // filtered down to. Cleared on an explicit "Reset Filters" click, or
  // when the tab/session actually ends (sessionStorage, not localStorage).
  const [categoryFilter, setCategoryFilter] = useState(
    () => sessionStorage.getItem("adminProductsCategoryFilter") || "",
  );
  const [subcategoryFilter, setSubcategoryFilter] = useState(
    () => sessionStorage.getItem("adminProductsSubcategoryFilter") || "",
  );
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (categoryFilter) {
      sessionStorage.setItem("adminProductsCategoryFilter", categoryFilter);
    } else {
      sessionStorage.removeItem("adminProductsCategoryFilter");
    }
  }, [categoryFilter]);

  useEffect(() => {
    if (subcategoryFilter) {
      sessionStorage.setItem(
        "adminProductsSubcategoryFilter",
        subcategoryFilter,
      );
    } else {
      sessionStorage.removeItem("adminProductsSubcategoryFilter");
    }
  }, [subcategoryFilter]);

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      const [categoriesRes, subcategoriesRes] = await Promise.all([
        getCategories(),
        getSubcategories(),
      ]);

      if (categoriesRes.success) setCategories(categoriesRes.categories);
      if (subcategoriesRes.success)
        setSubcategories(subcategoriesRes.subcategories);
    };

    loadFilterOptions();
  }, []);

  const subcategoryOptions = subcategories.filter(
    (sub) => sub.category?._id === categoryFilter,
  );

  const loadProducts = async () => {
    setLoading(true);

    const response = await getAllProducts({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      category: categoryFilter,
      subcategory: subcategoryFilter,
    });

    if (response.success) {
      setProducts(response.products);
      setTotal(response.total);
      setPages(response.pages);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, sortBy, sortOrder, categoryFilter, subcategoryFilter]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleCategoryFilterChange = (e) => {
    setCategoryFilter(e.target.value);
    setSubcategoryFilter("");
    setPage(1);
  };

  const handleSubcategoryFilterChange = (e) => {
    setSubcategoryFilter(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setCategoryFilter("");
    setSubcategoryFilter("");
    setSearch("");
    setPage(1);
  };

  const escapeCsv = (val) => {
    const s = val === undefined || val === null ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const handleExportExcel = async () => {
    setExporting(true);

    const response = await getAllProducts({
      page: 1,
      limit: 5000,
      search,
      sortBy,
      sortOrder,
      category: categoryFilter,
      subcategory: subcategoryFilter,
    });

    setExporting(false);

    if (!response.success || response.products.length === 0) {
      alert("No products to export for the current filters");
      return;
    }

    const columns = [
      "Name",
      "Category",
      "Subcategory",
      "Price",
      "MRP",
      "All Sizes (Price/MRP/Purchase Price)",
      "Stock",
      "Purchase Price",
      "Misc Exps",
      "Total Cost",
      "Fabric",
      "Size",
      "GSM",
      "Brand",
      "Country of Origin",
      "Featured",
      "Returnable",
      "Trending",
      "Restock Alert",
      "Will Restock",
      "Show Product",
      "Status",
      "Purchase Date",
      "Product ID",
      "Product Number",
      "Created Date",
    ];

    const rows = response.products.map((p) => {
      const purchasePrice = Math.round(Number(p.purchasePrice) || 0);
      const miscExpenses = Math.round(Number(p.miscExpenses) || 0);

      const allSizes = p.variants?.length
        ? p.variants
            .map(
              (v) =>
                `${v.size}: ₹${v.price}${v.oldPrice ? ` (MRP ₹${v.oldPrice})` : ""}${v.purchasePrice ? ` [PP ₹${v.purchasePrice}]` : ""}`,
            )
            .join(" | ")
        : "";

      return [
        p.name,
        p.category?.name || "",
        p.subcategory?.name || "",
        p.price,
        p.oldPrice || "",
        allSizes,
        p.stock,
        purchasePrice,
        miscExpenses,
        purchasePrice + miscExpenses,
        p.fabric || "",
        p.size || "",
        p.gsm || "",
        p.brand || "",
        p.countryOfOrigin || "",
        p.featured ? "Yes" : "No",
        p.isReturnable ? "Yes" : "No",
        p.isTrending ? "Yes" : "No",
        p.restockAlertEnabled ? "Yes" : "No",
        p.willRestock === false ? "No" : "Yes",
        VISIBILITY_LABELS[p.visibility || "both"],
        p.isActive ? "Active" : "Inactive",
        p.purchaseDate
          ? new Date(p.purchaseDate).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
        p._id,
        p.productNumber || "",
        new Date(p.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      ];
    });

    const csv =
      "﻿" +
      [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filterLabel = [
      categories.find((c) => c._id === categoryFilter)?.name,
      subcategories.find((s) => s._id === subcategoryFilter)?.name,
    ]
      .filter(Boolean)
      .join("-");

    link.href = url;
    link.download = `Mittal_Collections_Products${filterLabel ? `-${filterLabel}` : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLimitChange = (e) => {
    setLimit(Number(e.target.value));
    setPage(1);
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
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

  const handleDuplicate = async (id) => {
    const response = await duplicateProduct(id);

    if (response.success) {
      navigate(`/admin/products/edit/${response.product._id}`);
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreProduct(id);

    if (response.success) {
      loadProducts();
    } else {
      alert(response.message);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (
      !window.confirm(
        "Permanently delete this product? This cannot be undone.",
      )
    )
      return;

    const response = await permanentlyDeleteProduct(id);

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

      {/* Search + View Toggle */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search Product..."
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

      {/* Category / Subcategory filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Category
          </label>
          <select
            value={categoryFilter}
            onChange={handleCategoryFilterChange}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Subcategory
          </label>
          <select
            value={subcategoryFilter}
            onChange={handleSubcategoryFilterChange}
            disabled={!categoryFilter}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">All Subcategories</option>
            {subcategoryOptions.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleResetFilters}
          className="text-sm font-medium text-blue-600 hover:underline px-1 py-2"
        >
          Reset Filters
        </button>

        <button
          type="button"
          onClick={handleExportExcel}
          disabled={exporting}
          className="ml-auto flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          <FaFileExcel />
          {exporting ? "Generating..." : "Export to Excel"}
        </button>
      </div>

      {/* Pagination (top) */}
      {products.length > 0 && (
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
              {total} product{total !== 1 ? "s" : ""} total
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

      {viewMode === "list" && products.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-500">
            Show columns:
          </span>
          {OPTIONAL_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={visibleColumns[col.key]}
                onChange={() => toggleColumn(col.key)}
                className="rounded border-slate-300"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Products Found
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Image</th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("name")}
                >
                  Name
                  {renderSortIcon("name")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("categoryName")}
                >
                  Category
                  {renderSortIcon("categoryName")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("price")}
                >
                  Price
                  {renderSortIcon("price")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("stock")}
                >
                  Stock
                  {renderSortIcon("stock")}
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                  onClick={() => toggleSort("createdAt")}
                >
                  Created
                  {renderSortIcon("createdAt")}
                </th>
                {OPTIONAL_COLUMNS.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th
                        key={col.key}
                        className="text-center px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-900"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {renderSortIcon(col.key)}
                      </th>
                    ),
                )}
                <th className="text-center px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <tr key={product._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {product.image ? (
                      <img
                        src={`${imgUrl(product.image)}`}
                        alt={product.name}
                        onClick={() => setQuickViewProduct(product)}
                        className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div
                        onClick={() => setQuickViewProduct(product)}
                        className="w-12 h-12 flex items-center justify-center rounded-lg bg-slate-100 text-slate-400 text-[9px] font-medium text-center leading-tight cursor-pointer"
                      >
                        No Image
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {product.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {product.category?.name || "Uncategorized"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    ₹{product.price}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      product.stock > 0 ? "text-slate-600" : "text-red-600"
                    }`}
                  >
                    {product.stock}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(product.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  {OPTIONAL_COLUMNS.map((col) => {
                    if (!visibleColumns[col.key]) return null;

                    if (col.key === "visibility") {
                      const value = product.visibility || "both";
                      return (
                        <td key={col.key} className="px-4 py-3 text-center">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              value === "offline"
                                ? "bg-amber-100 text-amber-700"
                                : value === "online"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {VISIBILITY_LABELS[value]}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={col.key} className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            product[col.key]
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {product[col.key] ? "Yes" : "No"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        product.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {product.isActive ? (
                        <>
                          <Link
                            to={`/admin/products/edit/${product._id}`}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Edit
                          </Link>
                          <Link
                            to={`/admin/products/${product._id}/qr`}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white"
                          >
                            QR
                          </Link>
                          <button
                            onClick={() => setShareProduct(product)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5a] text-white"
                          >
                            Share
                          </button>
                          <button
                            onClick={() => handleDuplicate(product._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDelete(product._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(product._id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(product._id)}
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map((product) => (
            <div
              key={product._id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
            >
              {/* Image + Status badge */}
              <div className="relative">
                {product.image ? (
                  <img
                    src={`${imgUrl(product.image)}`}
                    alt={product.name}
                    onClick={() => setQuickViewProduct(product)}
                    className="w-full h-44 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                ) : (
                  <div
                    onClick={() => setQuickViewProduct(product)}
                    className="w-full h-44 flex items-center justify-center bg-slate-100 text-slate-400 text-sm font-medium cursor-pointer"
                  >
                    No Image
                  </div>
                )}

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

                {product.visibility && product.visibility !== "both" && (
                  <span
                    className={`inline-block w-fit text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${
                      product.visibility === "offline"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {VISIBILITY_LABELS[product.visibility]}
                  </span>
                )}

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
                <div className="mt-auto grid grid-cols-2 gap-2">
                  {product.isActive ? (
                    <>
                      <Link
                        to={`/admin/products/edit/${product._id}`}
                        className="text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Edit
                      </Link>

                      <Link
                        to={`/admin/products/${product._id}/qr`}
                        className="text-center bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        QR
                      </Link>

                      <button
                        onClick={() => setShareProduct(product)}
                        className="text-center flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        <FaWhatsapp />
                        Share
                      </button>

                      <button
                        onClick={() => handleDuplicate(product._id)}
                        className="text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Duplicate
                      </button>

                      <button
                        onClick={() => handleDelete(product._id)}
                        className="text-center bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRestore(product._id)}
                        className="text-center bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(product._id)}
                        className="text-center border border-red-600 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Delete Permanently
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {products.length > 0 && (
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
              {total} product{total !== 1 ? "s" : ""} total
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

      {quickViewProduct && (
        <ProductQuickView
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}

      {shareProduct && (
        <ShareProductModal
          product={shareProduct}
          onClose={() => setShareProduct(null)}
        />
      )}
    </div>
  );
}

export default AdminProducts;
