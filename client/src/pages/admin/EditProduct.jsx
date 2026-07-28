import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getProductById,
  updateProduct,
} from "../../services/adminProductService";

import "./EditProduct.css";

function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    oldPrice: "",
    stock: "",
    category: "",
    featured: false,
    isActive: true,
    image: null,
  });

  useEffect(() => {
    loadProduct();
  }, []);

  const loadProduct = async () => {
    const response = await getProductById(id);

    if (response.success) {
      const product = response.product;

      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price || "",
        oldPrice: product.oldPrice || "",
        stock: product.stock || "",
        category: product.category?._id || "",
        featured: product.featured,
        isActive: product.isActive,
        image: null,
      });

      setPreview(`http://localhost:5000${product.image}`);
    }

    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleImage = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    setFormData({
      ...formData,
      image: file,
    });

    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const data = new FormData();

    Object.keys(formData).forEach((key) => {
      if (formData[key] !== null) {
        data.append(key, formData[key]);
      }
    });

    const response = await updateProduct(id, data);

    if (response.success) {
      alert("Product Updated Successfully");
      navigate("/admin/products");
    } else {
      alert(response.message);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="edit-product-page">
        <h2>Loading Product...</h2>
      </div>
    );
  }

  return (
    <div className="edit-product-page">
      <div className="page-header">
        <h2>Edit Product</h2>
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
            <label>Price</label>

            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Old Price</label>

            <input
              type="number"
              name="oldPrice"
              value={formData.oldPrice}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Stock</label>

            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Category Id</label>

            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Product Image</label>

          <input type="file" onChange={handleImage} />
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
            Featured
          </label>

          <label>
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
            />
            Active
          </label>
        </div>

        <button className="save-btn" disabled={saving}>
          {saving ? "Updating..." : "Update Product"}
        </button>
      </form>
    </div>
  );
}

export default EditProduct;
