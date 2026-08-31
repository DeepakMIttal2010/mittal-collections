import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { addCategory } from "../../services/adminCategoryService";

function AddCategory() {
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nameHi: "",
    description: "",
    displayOrder: 0,
    featured: false,
    isActive: true,
    optimizeImages: true,
    image: null,
  });

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleImage = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    setFormData((prev) => ({
      ...prev,
      image: file,
    }));

    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();

    data.append("name", formData.name);
    data.append("nameHi", formData.nameHi);
    data.append("description", formData.description);
    data.append("displayOrder", formData.displayOrder);
    data.append("featured", formData.featured);
    data.append("isActive", formData.isActive);
    data.append("optimizeImages", formData.optimizeImages);

    if (formData.image) {
      data.append("image", formData.image);
    }

    setLoading(true);

    const response = await addCategory(data);

    setLoading(false);

    if (response.success) {
      alert("Category Added Successfully");
      navigate("/admin/categories");
    } else {
      alert(response.message || "Unable to add category");
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Add Category</h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Category Name
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
            Category Name (Hindi, optional)
          </label>
          <input
            type="text"
            name="nameHi"
            value={formData.nameHi}
            onChange={handleChange}
            placeholder="हिंदी में श्रेणी का नाम"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <textarea
            rows="4"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Display Order
          </label>
          <input
            type="number"
            name="displayOrder"
            value={formData.displayOrder}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Category Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImage}
            required
            className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
            <input
              type="checkbox"
              name="optimizeImages"
              checked={formData.optimizeImages}
              onChange={handleChange}
              className="w-4 h-4"
            />
            Reduce image size (best quality)
          </label>
        </div>

        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="w-40 h-40 object-cover rounded-lg border border-slate-200"
          />
        )}

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="featured"
              checked={formData.featured}
              onChange={handleChange}
              className="w-4 h-4"
            />
            Featured Category
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              className="w-4 h-4"
            />
            Active
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
        >
          {loading ? "Saving..." : "Save Category"}
        </button>
      </form>
    </div>
  );
}

export default AddCategory;
