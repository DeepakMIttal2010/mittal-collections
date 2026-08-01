import { useEffect, useState } from "react";

import {
  getAllCouponsAdmin,
  addCoupon,
  updateCoupon,
  restoreCoupon,
  deleteCoupon,
} from "../../services/adminCouponService";

const DEFAULT_FORM = {
  code: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  firstOrderOnly: false,
  description: "",
  showAsBanner: false,
  isActive: true,
};

function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState(DEFAULT_FORM);

  const loadData = async () => {
    setLoading(true);

    const response = await getAllCouponsAdmin();

    if (response.success) setCoupons(response.coupons);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const payload = {
      ...formData,
      discountValue: Number(formData.discountValue),
      maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : null,
    };

    const response = editingId
      ? await updateCoupon(editingId, payload)
      : await addCoupon(payload);

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
      code: item.code,
      discountType: item.discountType,
      discountValue: item.discountValue,
      maxDiscount: item.maxDiscount || "",
      firstOrderOnly: item.firstOrderOnly,
      description: item.description || "",
      showAsBanner: item.showAsBanner,
      isActive: item.isActive,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;

    const response = await deleteCoupon(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleRestore = async (id) => {
    const response = await restoreCoupon(id);

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
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Coupons</h2>
      <p className="text-sm text-slate-500 mb-6">
        Manage discount coupons. A "First order only" coupon can only be
        applied by a customer who has never placed an order before.
      </p>

      {/* Add / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Coupon Code
          </label>
          <input
            type="text"
            name="code"
            placeholder="WELCOME10"
            value={formData.code}
            onChange={handleChange}
            required
            disabled={Boolean(editingId)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Discount Type
          </label>
          <select
            name="discountType"
            value={formData.discountType}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="flat">Flat (₹)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Discount Value
          </label>
          <input
            type="number"
            name="discountValue"
            min="0"
            value={formData.discountValue}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Max Discount (₹, optional)
          </label>
          <input
            type="number"
            name="maxDiscount"
            min="0"
            placeholder="No cap"
            value={formData.maxDiscount}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <input
            type="text"
            name="description"
            placeholder="10% off your first order, up to ₹1000"
            value={formData.description}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="firstOrderOnly"
            checked={formData.firstOrderOnly}
            onChange={handleChange}
            id="firstOrderOnly"
          />
          <label htmlFor="firstOrderOnly" className="text-sm text-slate-700">
            First order only
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="showAsBanner"
            checked={formData.showAsBanner}
            onChange={handleChange}
            id="showAsBanner"
          />
          <label htmlFor="showAsBanner" className="text-sm text-slate-700">
            Show as site banner
          </label>
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
      {coupons.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Coupons Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Code</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Discount
                </th>
                <th className="text-left px-4 py-3 font-semibold">Rules</th>
                <th className="text-center px-4 py-3 font-semibold">
                  Banner
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
              {coupons.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.code}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.discountType === "flat"
                      ? `₹${item.discountValue}`
                      : `${item.discountValue}%`}
                    {item.maxDiscount ? ` (max ₹${item.maxDiscount})` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.firstOrderOnly ? "First order only" : "Any order"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.showAsBanner ? "Yes" : "—"}
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
                        <button
                          onClick={() => handleRestore(item._id)}
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
      )}
    </div>
  );
}

export default AdminCoupons;
