import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaTrash, FaEdit, FaTimes, FaPlus } from "react-icons/fa";

import {
  getOfflineSales,
  recordOfflineSale,
  updateOfflineSale,
  deleteOfflineSale,
  voidOfflineSale,
  getProductForPOS,
} from "../../services/posService";

const PAYMENT_METHODS = ["Cash", "UPI", "Card"];

const formatCurrency = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// One modal for both Create and Edit — a brand new sale (sale=null)
// starts with an empty cart and calls recordOfflineSale; editing an
// existing one pre-fills from it and calls updateOfflineSale instead.
// Item quantities/prices are editable inline, a new item is added by
// pasting a product id (same lookup AdminPOS.jsx's QR-scan flow already
// uses under the hood), and payment/customer/discount fields are plain
// inputs. A voided sale never reaches this in edit mode (the "Edit"
// action is hidden for those on the list itself, and the server refuses
// it too) — void.js's own comment explains why it's kept as a fixed
// record instead of being editable.
function SaleFormModal({ sale, onClose, onSaved }) {
  const isEdit = Boolean(sale);

  const [items, setItems] = useState(
    isEdit
      ? sale.items.map((item) => ({
          productId: item.product,
          productName: item.productName,
          size: item.size || "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }))
      : [],
  );
  const [paymentMethod, setPaymentMethod] = useState(isEdit ? sale.paymentMethod : "Cash");
  const [customerMobile, setCustomerMobile] = useState(isEdit ? sale.customerMobile || "" : "");
  const [customerName, setCustomerName] = useState(isEdit ? sale.customerName || "" : "");
  const [discountAmount, setDiscountAmount] = useState(isEdit ? sale.discountAmount || 0 : 0);
  const [editReason, setEditReason] = useState("");
  const [newProductId, setNewProductId] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = Math.max(subtotal - (Number(discountAmount) || 0), 0);

  const updateItem = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = async () => {
    if (!newProductId.trim()) return;

    setAddingItem(true);
    const response = await getProductForPOS(newProductId.trim());
    setAddingItem(false);

    if (!response.success) {
      toast.error(response.message || "Product not found");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        productId: response.product._id,
        productName: response.product.name,
        size: "",
        quantity: 1,
        unitPrice: response.product.price,
      },
    ]);
    setNewProductId("");
  };

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error("A sale must have at least one item");
      return;
    }

    const payload = {
      items: items.map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        size: i.size,
      })),
      paymentMethod,
      customerMobile,
      customerName,
      discountAmount,
    };

    setSaving(true);
    const response = isEdit
      ? await updateOfflineSale(sale._id, { ...payload, editReason })
      : await recordOfflineSale(payload);
    setSaving(false);

    if (response.success) {
      toast.success(isEdit ? "Sale updated" : "Sale recorded");
      onSaved();
    } else {
      toast.error(response.message || `Unable to ${isEdit ? "update" : "record"} the sale`);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-slate-900">{isEdit ? "Edit Sale" : "New Sale"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                No items yet — add one below by product ID.
              </p>
            )}
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {item.productName}
                  </p>
                  <input
                    type="text"
                    value={item.size}
                    onChange={(e) => updateItem(i, "size", e.target.value)}
                    placeholder="Size (optional)"
                    className="text-xs text-slate-500 border-b border-transparent hover:border-slate-300 outline-none w-24"
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", e.target.value)}
                  className="w-16 text-sm border border-slate-300 rounded px-2 py-1"
                />
                <span className="text-slate-400">×</span>
                <input
                  type="number"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                  className="w-20 text-sm border border-slate-300 rounded px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  aria-label="Remove item"
                  className="text-red-500 hover:text-red-700 shrink-0"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              placeholder="Product ID to add an item"
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 outline-none"
            />
            <button
              type="button"
              onClick={handleAddItem}
              disabled={addingItem}
              className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              <FaPlus className="text-xs" /> Add
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Discount (₹)</label>
              <input
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Customer Mobile</label>
              <input
                type="text"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              />
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="text-xs text-slate-500">Reason for this edit (optional, kept for the record)</label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. mis-scanned quantity, wrong price typed in"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm">
            <span className="text-slate-500">Subtotal: {formatCurrency(subtotal)}</span>
            <span className="font-semibold text-slate-800">
              New Total: {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 shrink-0 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-white bg-blue-900 hover:bg-blue-950 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Record Sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPOSSales() {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const [editingSale, setEditingSale] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const limit = 25;

  const load = async () => {
    setLoading(true);
    const response = await getOfflineSales({
      page,
      limit,
      paymentMethod: paymentMethod || undefined,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      q: q || undefined,
    });

    if (response.success) {
      setSales(response.sales);
      setSummary(response.summary);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } else {
      toast.error("Unable to load sales");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, paymentMethod, status, startDate, endDate, q]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  const handleVoid = async (saleId) => {
    if (
      !window.confirm(
        "Void this sale? Stock will be restored and any loyalty points reversed.",
      )
    ) {
      return;
    }
    const reason = window.prompt("Reason for voiding (optional):") || "";

    setBusyId(saleId);
    const response = await voidOfflineSale(saleId, reason);
    setBusyId(null);

    if (response.success) {
      toast.success("Sale voided — stock restored");
      load();
    } else {
      toast.error(response.message || "Unable to void sale");
    }
  };

  const handleDelete = async (sale) => {
    const warning = sale.voided
      ? "Permanently delete this voided sale? This cannot be undone."
      : "Permanently delete this sale? Stock will be restored and any loyalty points reversed first. This cannot be undone.";

    if (!window.confirm(warning)) return;

    setBusyId(sale._id);
    const response = await deleteOfflineSale(sale._id);
    setBusyId(null);

    if (response.success) {
      toast.success("Sale deleted");
      load();
    } else {
      toast.error(response.message || "Unable to delete sale");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">POS Sales</h1>
          <p className="text-sm text-slate-500">
            Every in-store sale — search, edit, void or delete.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-sm font-medium text-white bg-blue-900 hover:bg-blue-950 rounded-lg px-4 py-2 flex items-center gap-1.5"
          >
            <FaPlus className="text-xs" /> New Sale
          </button>
          <Link
            to="/admin/pos"
            className="text-sm font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            ← Back to POS Cart
          </Link>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xl font-bold text-slate-800">
              {formatCurrency(summary.totalRevenue)}
            </p>
            <p className="text-xs text-slate-500">Revenue (filtered)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xl font-bold text-slate-800">{summary.activeCount}</p>
            <p className="text-xs text-slate-500">Active Sales</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xl font-bold text-red-500">{summary.voidedCount}</p>
            <p className="text-xs text-slate-500">Voided</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">By Payment Method</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.byPaymentMethod.length === 0 ? (
                <span className="text-xs text-slate-400">—</span>
              ) : (
                summary.byPaymentMethod.map((p) => (
                  <span
                    key={p.paymentMethod}
                    className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"
                  >
                    {p.paymentMethod}: {formatCurrency(p.total)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search customer, staff or product..."
            className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          />
          <button
            type="submit"
            className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3 py-1.5"
          >
            Search
          </button>
        </form>

        <select
          value={paymentMethod}
          onChange={(e) => {
            setPage(1);
            setPaymentMethod(e.target.value);
          }}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
        >
          <option value="">All Payment Methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="voided">Voided</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setPage(1);
            setStartDate(e.target.value);
          }}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setPage(1);
            setEndDate(e.target.value);
          }}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading...</p>
        ) : sales.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No sales match this.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="py-2 px-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Items</th>
                <th className="py-2 px-3 font-medium">Total</th>
                <th className="py-2 px-3 font-medium">Payment</th>
                <th className="py-2 px-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Staff</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s._id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                    {formatDateTime(s.createdAt)}
                  </td>
                  <td className="py-2 px-3 max-w-[220px]">
                    <p className="text-slate-700 truncate" title={s.items.map((i) => i.productName).join(", ")}>
                      {s.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}
                    </p>
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                    {formatCurrency(s.totalAmount)}
                  </td>
                  <td className="py-2 px-3 text-slate-600">{s.paymentMethod}</td>
                  <td className="py-2 px-3 text-slate-600">
                    {s.customerName || "—"}
                    {s.customerMobile && (
                      <span className="block text-xs text-slate-400">{s.customerMobile}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                    {s.soldBy?.name || "—"}
                  </td>
                  <td className="py-2 px-3">
                    {s.voided ? (
                      <span className="text-xs font-medium text-red-500">Voided</span>
                    ) : (
                      <span className="text-xs font-medium text-green-600">Active</span>
                    )}
                    {s.lastEditedAt && (
                      <span className="block text-[10px] text-amber-600" title={s.editReason}>
                        Edited
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {!s.voided && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingSale(s)}
                            aria-label="Edit sale"
                            className="text-blue-700 hover:text-blue-900"
                          >
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoid(s._id)}
                            disabled={busyId === s._id}
                            className="text-xs text-amber-600 hover:underline disabled:opacity-50"
                          >
                            Void
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        disabled={busyId === s._id}
                        aria-label="Delete sale"
                        className="text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-blue-700 hover:underline disabled:text-slate-300 disabled:no-underline"
          >
            ← Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages} ({total} sales)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-blue-700 hover:underline disabled:text-slate-300 disabled:no-underline"
          >
            Next →
          </button>
        </div>
      )}

      {(showCreate || editingSale) && (
        <SaleFormModal
          sale={editingSale}
          onClose={() => {
            setShowCreate(false);
            setEditingSale(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditingSale(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default AdminPOSSales;
