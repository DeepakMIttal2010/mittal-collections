import { useState } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import Papa from "papaparse";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { addProduct } from "../../services/adminProductService";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

const generateSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildDescription = (row) => {
  if (row.description?.trim()) return row.description.trim();

  const parts = [`${row.name} from Mittal Collections.`];

  if (row.size?.trim()) parts.push(`Approx. size ${row.size.trim()}.`);
  if (row.extraDetails?.trim()) parts.push(row.extraDetails.trim());

  parts.push(
    `Quality ${(row.category || "home furnishing").toLowerCase()} designed for everyday use.`,
  );

  return parts.join(" ");
};

function AdminBulkImport() {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [taxonomyLoaded, setTaxonomyLoaded] = useState(false);

  const [imageGroups, setImageGroups] = useState({}); // { folderName: File[] }
  const [csvData, setCsvData] = useState(null); // parsed CSV rows
  const [rows, setRows] = useState([]); // review rows
  const [unmatchedFolders, setUnmatchedFolders] = useState([]);
  const [unmatchedCsvKeys, setUnmatchedCsvKeys] = useState([]);

  const [showHelp, setShowHelp] = useState(true);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResults, setImportResults] = useState([]);

  const loadTaxonomy = async () => {
    const [catRes, subRes] = await Promise.all([
      getCategories(),
      getSubcategories(),
    ]);

    if (catRes.success) setCategories(catRes.categories);
    if (subRes.success) setSubcategories(subRes.subcategories);

    setTaxonomyLoaded(true);
  };

  const handleFolderSelect = async (e) => {
    if (!taxonomyLoaded) await loadTaxonomy();

    const files = Array.from(e.target.files);
    const groups = {};

    files.forEach((file) => {
      if (!IMAGE_EXT.test(file.name)) return;

      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split("/");
      const folder = parts.length > 1 ? parts[1] : parts[0];

      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(file);
    });

    setImageGroups(groups);
    buildReview(groups, csvData);
  };

  const handleCsvSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCsvData(result.data);
        buildReview(imageGroups, result.data);
      },
    });
  };

  const resolveCategory = (name) =>
    categories.find((c) => c.name.toLowerCase() === (name || "").toLowerCase().trim());

  const resolveSubcategory = (name, categoryId) =>
    subcategories.find(
      (s) =>
        s.name.toLowerCase() === (name || "").toLowerCase().trim() &&
        s.category?._id === categoryId,
    );

  const buildReview = (groups, csvRows) => {
    if (!csvRows) return;

    const folderNames = Object.keys(groups);
    const csvFolders = csvRows.map((r) => r.folder?.trim()).filter(Boolean);

    setUnmatchedFolders(folderNames.filter((f) => !csvFolders.includes(f)));
    setUnmatchedCsvKeys(
      csvRows
        .map((r) => r.folder?.trim())
        .filter((f) => f && !folderNames.includes(f)),
    );

    const built = csvRows
      .filter((r) => r.folder?.trim() && groups[r.folder.trim()])
      .map((r) => {
        const folder = r.folder.trim();
        const images = groups[folder] || [];
        const category = resolveCategory(r.category);
        const subcategory = category
          ? resolveSubcategory(r.subcategory, category._id)
          : null;

        const name = r.name?.trim() || folder;

        const row = {
          folder,
          images,
          name,
          categoryName: r.category?.trim() || "",
          categoryId: category?._id || "",
          subcategoryName: r.subcategory?.trim() || "",
          subcategoryId: subcategory?._id || "",
          price: r.price?.trim() || "",
          oldPrice: r.oldPrice?.trim() || "",
          stock: r.stock?.trim() || "0",
          size: r.size?.trim() || "",
          extraDetails: r.extraDetails?.trim() || "",
          description: "",
        };

        row.description = buildDescription({
          ...row,
          category: r.category,
          description: r.description,
        });

        return row;
      });

    setRows(built);
    setImportResults([]);
  };

  const updateRow = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const rowStatus = (row) => {
    if (row.images.length === 0) return { ok: false, reason: "No images found" };
    if (!row.name) return { ok: false, reason: "Name is required" };
    if (!row.categoryId) return { ok: false, reason: "Category not matched" };
    if (row.subcategoryName && !row.subcategoryId)
      return { ok: false, reason: "Subcategory not matched" };
    if (!row.price || isNaN(Number(row.price)))
      return { ok: false, reason: "Price is invalid" };
    return { ok: true, reason: "" };
  };

  const readyCount = rows.filter((r) => rowStatus(r).ok).length;

  const handleImport = async () => {
    const readyRows = rows.filter((r) => rowStatus(r).ok);

    if (readyRows.length === 0) {
      alert("No rows are ready to import. Fix the errors shown in red first.");
      return;
    }

    if (
      !window.confirm(
        `Import ${readyRows.length} product(s)? This will create them live.`,
      )
    )
      return;

    setImporting(true);
    setImportProgress({ done: 0, total: readyRows.length });
    setImportResults([]);

    const results = [];

    for (const row of readyRows) {
      const data = new FormData();

      data.append("name", row.name);
      data.append("description", row.description);
      data.append("category", row.categoryId);
      data.append("subcategory", row.subcategoryId || "");
      data.append("price", row.price);
      data.append("oldPrice", row.oldPrice || "0");
      data.append("stock", row.stock || "0");
      data.append("featured", "false");
      data.append("isActive", "true");
      data.append("isTrending", "false");
      data.append("trendingRank", "0");
      data.append("mainImageIndex", "0");
      data.append("optimizeImages", "true");

      row.images.forEach((file) => data.append("images", file));

      const response = await addProduct(data);

      results.push({
        folder: row.folder,
        name: row.name,
        success: response.success,
        message: response.message,
        productId: response.product?._id,
      });

      setImportProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      setImportResults([...results]);
    }

    setImporting(false);
  };

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">
        Bulk Import Products
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Select a parent folder (with one subfolder per product) and a CSV
        with product details. Review everything below before publishing —
        nothing is created until you click Import.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl mb-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHelp((prev) => !prev)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-blue-800"
        >
          How to use this tool
          {showHelp ? <FaChevronUp /> : <FaChevronDown />}
        </button>

        {showHelp && (
          <div className="px-5 pb-5 text-sm text-blue-900 space-y-3">
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Create a parent folder with one subfolder per product (e.g.
                like the P1, P2, P3 folders used before) — each subfolder
                holds only that product&apos;s images.
              </li>
              <li>
                Create a CSV (in Excel, use &quot;Save As&quot; →
                CSV) with these columns:
                <code className="block bg-white border border-blue-200 rounded px-2 py-1 mt-1 text-xs font-mono text-slate-700">
                  folder, name, category, subcategory, price, oldPrice,
                  stock, size, extraDetails, description
                </code>
              </li>
              <li>
                Below, select the parent folder, then upload the CSV.
              </li>
              <li>
                A review table appears — Category is auto-matched against
                your existing categories, and Description is auto-drafted
                using the size/extraDetails you provided. Everything in the
                table is editable before you publish.
              </li>
              <li>
                Click <strong>Import &amp; Publish</strong> — only rows
                marked &quot;Ready&quot; are imported, one by one, with a
                progress count.
              </li>
            </ol>

            <p className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              <strong>Note:</strong> the <code>category</code> /{" "}
              <code>subcategory</code> names in the CSV must exactly match
              what already exists in the system (e.g. &quot;Doormats&quot;,
              &quot;Cotton Doormats&quot;). If it doesn&apos;t match, the row
              shows &quot;Category not matched&quot; in red and won&apos;t
              import until you pick it manually from the dropdown.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              1. Product Images Folder
            </label>
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {Object.keys(imageGroups).length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {Object.keys(imageGroups).length} folder(s) found
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              2. Product Details CSV
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvSelect}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-slate-500 mt-1">
              Columns: folder, name, category, subcategory, price, oldPrice,
              stock, size, extraDetails, description
            </p>
          </div>
        </div>

        {(unmatchedFolders.length > 0 || unmatchedCsvKeys.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            {unmatchedFolders.length > 0 && (
              <p>
                Folders with no matching CSV row (skipped):{" "}
                {unmatchedFolders.join(", ")}
              </p>
            )}
            {unmatchedCsvKeys.length > 0 && (
              <p>
                CSV rows with no matching folder (skipped):{" "}
                {unmatchedCsvKeys.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-3 font-semibold">Image</th>
                  <th className="text-left px-3 py-3 font-semibold">Name</th>
                  <th className="text-left px-3 py-3 font-semibold">
                    Category
                  </th>
                  <th className="text-left px-3 py-3 font-semibold">
                    Subcategory
                  </th>
                  <th className="text-left px-3 py-3 font-semibold">Price</th>
                  <th className="text-left px-3 py-3 font-semibold">
                    Old Price
                  </th>
                  <th className="text-left px-3 py-3 font-semibold">Stock</th>
                  <th className="text-left px-3 py-3 font-semibold w-64">
                    Description
                  </th>
                  <th className="text-left px-3 py-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => {
                  const status = rowStatus(row);
                  const subcategoryOptions = subcategories.filter(
                    (s) => s.category?._id === row.categoryId,
                  );
                  const result = importResults.find(
                    (r) => r.folder === row.folder,
                  );

                  return (
                    <tr key={row.folder} className="align-top">
                      <td className="px-3 py-3">
                        {row.images[0] && (
                          <img
                            src={URL.createObjectURL(row.images[0])}
                            alt={row.name}
                            className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                          />
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">
                          {row.images.length} img · {row.folder}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) =>
                            updateRow(index, "name", e.target.value)
                          }
                          className="w-36 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">
                          /{generateSlug(row.name)}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={row.categoryId}
                          onChange={(e) => {
                            const cat = categories.find(
                              (c) => c._id === e.target.value,
                            );
                            updateRow(index, "categoryId", e.target.value);
                            updateRow(index, "categoryName", cat?.name || "");
                            updateRow(index, "subcategoryId", "");
                          }}
                          className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
                        >
                          <option value="">Select</option>
                          {categories.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={row.subcategoryId}
                          onChange={(e) =>
                            updateRow(index, "subcategoryId", e.target.value)
                          }
                          disabled={!row.categoryId}
                          className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
                        >
                          <option value="">None</option>
                          {subcategoryOptions.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={row.price}
                          onChange={(e) =>
                            updateRow(index, "price", e.target.value)
                          }
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={row.oldPrice}
                          onChange={(e) =>
                            updateRow(index, "oldPrice", e.target.value)
                          }
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={row.stock}
                          onChange={(e) =>
                            updateRow(index, "stock", e.target.value)
                          }
                          className="w-16 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <textarea
                          rows={3}
                          value={row.description}
                          onChange={(e) =>
                            updateRow(index, "description", e.target.value)
                          }
                          className="w-64 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-3 py-3">
                        {result ? (
                          <span
                            className={`text-xs font-semibold ${
                              result.success
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {result.success ? "Imported" : result.message}
                          </span>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              status.ok ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {status.ok ? "Ready" : status.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-4 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              {readyCount} of {rows.length} row(s) ready to import
            </p>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || readyCount === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {importing
                ? `Importing ${importProgress.done}/${importProgress.total}...`
                : `Import & Publish (${readyCount})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBulkImport;
