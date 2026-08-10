import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { getAllProducts } from "../../services/adminProductService";
import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";

// Reasonably small but still reliably scannable at close range — 130px
// with default margin (quiet zone) and error-correction keeps a phone
// camera reading it fine, and lets a lot more labels fit per printed page.
const QR_WIDTH = 130;

const emptyFilters = {
  category: "",
  subcategory: "",
  stockStatus: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

function PrintLabels() {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);

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

  useEffect(() => {
    const loadLabels = async () => {
      setLoading(true);

      const response = await getAllProducts({ limit: 1000, ...filters });

      if (!response.success) {
        setLabels([]);
        setLoading(false);
        return;
      }

      const generated = await Promise.all(
        response.products.map(async (product) => {
          const url = `${window.location.origin}/admin/pos/${product._id}`;
          const qrDataUrl = await QRCode.toDataURL(url, { width: QR_WIDTH });

          return {
            id: product._id,
            name: product.name,
            price: product.price,
            oldPrice: product.oldPrice,
            productNumber: product.productNumber,
            qrDataUrl,
          };
        }),
      );

      setLabels(generated);
      setLoading(false);
    };

    loadLabels();
  }, [filters]);

  const subcategoryOptions = subcategories.filter(
    (sub) => sub.category?._id === filters.category,
  );

  const handleFilterChange = (e) => {
    const { name, value } = e.target;

    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "category" ? { subcategory: "" } : {}),
    }));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Print Product Labels
          </h2>
          <p className="text-sm text-slate-500">
            Each QR code opens the in-store sale page for that product when
            scanned. Print, cut, and stick on the product.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-2.5 transition-colors"
        >
          Print
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6 print:hidden bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Category
          </label>
          <select
            name="category"
            value={filters.category}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
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
            name="subcategory"
            value={filters.subcategory}
            onChange={handleFilterChange}
            disabled={!filters.category}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-100"
          >
            <option value="">All</option>
            {subcategoryOptions.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Stock
          </label>
          <select
            name="stockStatus"
            value={filters.stockStatus}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="inStock">In Stock</option>
            <option value="outOfStock">Out of Stock</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Purchased From
          </label>
          <input
            type="date"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Purchased To
          </label>
          <input
            type="date"
            name="dateTo"
            value={filters.dateTo}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col flex-1 min-w-[160px]">
          <label className="text-xs font-semibold text-slate-500 mb-1">
            Search
          </label>
          <input
            type="text"
            name="search"
            placeholder="Product name..."
            value={filters.search}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>

        <button
          onClick={() => setFilters(emptyFilters)}
          className="text-sm text-blue-700 hover:underline px-2 py-1.5"
        >
          Clear Filters
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Generating labels...</p>
      ) : labels.length === 0 ? (
        <p className="text-slate-500">No products match these filters.</p>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-3 print:hidden">
            {labels.length} label{labels.length === 1 ? "" : "s"}
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 print:grid-cols-4">
            {labels.map((label) => (
              <div
                key={label.id}
                className="border border-slate-300 rounded-lg p-2 text-center break-inside-avoid"
              >
                <img
                  src={label.qrDataUrl}
                  alt={`QR code for ${label.name}`}
                  className="mx-auto w-full max-w-[110px]"
                />
                <p className="text-xs font-semibold text-slate-800 mt-1.5 truncate">
                  {label.name}
                </p>
                <p className="text-[11px]">
                  {label.oldPrice > label.price && (
                    <span className="text-slate-400 line-through mr-1">
                      ₹{label.oldPrice}
                    </span>
                  )}
                  <span className="font-semibold text-slate-700">
                    ₹{label.price}
                  </span>
                </p>
                <p className="text-[9px] text-slate-400 font-mono truncate">
                  {label.productNumber}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default PrintLabels;
