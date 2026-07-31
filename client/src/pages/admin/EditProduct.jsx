import { SERVER_URL } from "../../services/api";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getProductById,
  updateProduct,
} from "../../services/adminProductService";
import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";

import "./EditProduct.css";

function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);
  const [mainImageIndex, setMainImageIndex] = useState(0);

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    oldPrice: "",
    stock: "",
    category: "",
    subcategory: "",
    featured: false,
    isActive: true,
    isTrending: false,
    trendingRank: 0,
  });

  const loadProduct = async () => {
    const [productRes, categoriesRes, subcategoriesRes] = await Promise.all([
      getProductById(id),
      getCategories(),
      getSubcategories(),
    ]);

    if (categoriesRes.success) setCategories(categoriesRes.categories);
    if (subcategoriesRes.success)
      setSubcategories(subcategoriesRes.subcategories);

    if (productRes.success) {
      const product = productRes.product;

      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price || "",
        oldPrice: product.oldPrice || "",
        stock: product.stock || "",
        category: product.category?._id || "",
        subcategory: product.subcategory?._id || "",
        featured: product.featured,
        isActive: product.isActive,
        isTrending: product.isTrending || false,
        trendingRank: product.trendingRank || 0,
      });

      const images = product.images?.length
        ? product.images
        : [product.image].filter(Boolean);

      setExistingImages(images);
      setMainImageIndex(Math.max(images.indexOf(product.image), 0));
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
  }, []);

  const subcategoryOptions = subcategories.filter(
    (sub) => sub.category?._id === formData.category,
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "category" ? { subcategory: "" } : {}),
    });
  };

  const handleAddImages = (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    setNewImages((prev) => [...prev, ...files]);
    setNewPreviews((prev) => [
      ...prev,
      ...files.map((file) => URL.createObjectURL(file)),
    ]);
  };

  const handleRemoveExisting = (index) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));

    setMainImageIndex((prev) => {
      if (index === prev) return 0;
      if (index < prev) return prev - 1;
      return prev;
    });
  };

  const handleRemoveNew = (index) => {
    const combinedIndex = existingImages.length + index;

    setNewImages((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));

    setMainImageIndex((prev) => {
      if (combinedIndex === prev) return 0;
      if (combinedIndex < prev) return prev - 1;
      return prev;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (existingImages.length + newImages.length === 0) {
      alert("Please keep or add at least one product image");
      return;
    }

    setSaving(true);

    const data = new FormData();

    Object.keys(formData).forEach((key) => {
      if (formData[key] !== null) {
        data.append(key, formData[key]);
      }
    });

    data.append("existingImages", JSON.stringify(existingImages));
    data.append("mainImageIndex", mainImageIndex);
    newImages.forEach((file) => data.append("images", file));

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
            <label>Subcategory</label>

            <select
              name="subcategory"
              value={formData.subcategory}
              onChange={handleChange}
              disabled={!formData.category}
            >
              <option value="">
                {formData.category ? "None" : "Select category first"}
              </option>

              {subcategoryOptions.map((sub) => (
                <option key={sub._id} value={sub._id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Product Images</label>

          <input type="file" accept="image/*" multiple onChange={handleAddImages} />
        </div>

        {(existingImages.length > 0 || newPreviews.length > 0) && (
          <div className="image-thumb-grid">
            {existingImages.map((url, index) => (
              <div
                key={url}
                className={`image-thumb${
                  index === mainImageIndex ? " is-main" : ""
                }`}
                onClick={() => setMainImageIndex(index)}
              >
                <img
                  src={`${SERVER_URL}${url}`}
                  alt={`Product ${index + 1}`}
                />
                <button
                  type="button"
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveExisting(index);
                  }}
                >
                  ×
                </button>
                {index === mainImageIndex && (
                  <span className="main-badge">Main</span>
                )}
              </div>
            ))}

            {newPreviews.map((src, index) => {
              const combinedIndex = existingImages.length + index;

              return (
                <div
                  key={src}
                  className={`image-thumb${
                    combinedIndex === mainImageIndex ? " is-main" : ""
                  }`}
                  onClick={() => setMainImageIndex(combinedIndex)}
                >
                  <img src={src} alt={`New ${index + 1}`} />
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveNew(index);
                    }}
                  >
                    ×
                  </button>
                  {combinedIndex === mainImageIndex && (
                    <span className="main-badge">Main</span>
                  )}
                </div>
              );
            })}
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

          <label>
            <input
              type="checkbox"
              name="isTrending"
              checked={formData.isTrending}
              onChange={handleChange}
            />
            Show in Trending
          </label>
        </div>

        {formData.isTrending && (
          <div className="form-row">
            <div className="form-group">
              <label>Trending Rank (lower shows first)</label>

              <input
                type="number"
                name="trendingRank"
                value={formData.trendingRank}
                onChange={handleChange}
                min="0"
              />
            </div>
          </div>
        )}

        <button className="save-btn" disabled={saving}>
          {saving ? "Updating..." : "Update Product"}
        </button>
      </form>
    </div>
  );
}

export default EditProduct;
