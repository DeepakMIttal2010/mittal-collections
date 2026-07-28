import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./AddProduct.css";

import { getCategories } from "../../services/categoryService";
import { addProduct } from "../../services/adminProductService";

function AddProduct() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);

  const [preview, setPreview] = useState(null);

  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    oldPrice: "",
    stock: "",
    featured: false,
    isActive: true,
    image: null,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const response = await getCategories();

    if (response.success) {
      setCategories(response.categories);
    }
  };

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
    data.append("description", formData.description);
    data.append("category", formData.category);
    data.append("price", formData.price);
    data.append("oldPrice", formData.oldPrice);
    data.append("stock", formData.stock);
    data.append("featured", formData.featured);
    data.append("isActive", formData.isActive);

    if (formData.image) {
      data.append("image", formData.image);
    }

    setLoading(true);

    const response = await addProduct(data);

    setLoading(false);

    if (response.success) {
      alert("Product Added Successfully");

      navigate("/admin/products");
    } else {
      alert(response.message || "Unable to add product");
    }
  };

  return (
    <div className="add-product-page">
      <div className="page-header">
        <h2>Add Product</h2>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Product Name</label>

          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>

          <textarea
            rows="5"
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Category</label>

            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="">Select Category</option>

              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Price</label>

            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Old Price</label>

            <input
              type="number"
              name="oldPrice"
              value={formData.oldPrice}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Stock</label>

            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Product Image</label>

          <input type="file" accept="image/*" onChange={handleImage} required />
        </div>

        {preview && (
          <div className="image-preview">
            <img src={preview} alt="Preview" />
          </div>
        )}

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              name="featured"
              checked={formData.featured}
              onChange={handleChange}
            />
            Featured Product
          </label>

          <label>
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
            />
            Active Product
          </label>
        </div>

        <button className="save-btn" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Product"}
        </button>
      </form>
    </div>
  );
}

export default AddProduct;
