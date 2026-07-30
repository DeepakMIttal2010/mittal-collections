import { useEffect, useState } from "react";

import {
  getAllTestimonialsAdmin,
  addTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from "../../services/adminTestimonialService";

function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    rating: 5,
    review: "",
    displayOrder: 0,
    isActive: true,
  });

  const loadData = async () => {
    setLoading(true);

    const response = await getAllTestimonialsAdmin();

    if (response.success) setTestimonials(response.testimonials);

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
    setFormData({
      name: "",
      city: "",
      rating: 5,
      review: "",
      displayOrder: 0,
      isActive: true,
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = editingId
      ? await updateTestimonial(editingId, formData)
      : await addTestimonial(formData);

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
      name: item.name,
      city: item.city,
      rating: item.rating,
      review: item.review,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this testimonial?")) return;

    const response = await deleteTestimonial(id);

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
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        Manage Testimonials
      </h2>

      {/* Add / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            City
          </label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Rating
          </label>
          <select
            name="rating"
            value={formData.rating}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} Star{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Review
          </label>
          <input
            type="text"
            name="review"
            placeholder="What the customer said"
            value={formData.review}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Order
          </label>
          <input
            type="number"
            name="displayOrder"
            value={formData.displayOrder}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
      {testimonials.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Testimonials Yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">City</th>
                <th className="text-center px-4 py-3 font-semibold">
                  Rating
                </th>
                <th className="text-left px-4 py-3 font-semibold">Review</th>
                <th className="text-center px-4 py-3 font-semibold">
                  Order
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
              {testimonials.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.city}</td>
                  <td className="px-4 py-3 text-center">{item.rating} ★</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {item.review}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.displayOrder}
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

export default AdminTestimonials;
