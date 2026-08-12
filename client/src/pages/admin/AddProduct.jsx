import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./AddProduct.css";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { addProduct } from "../../services/adminProductService";

function AddProduct() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [mainImageIndex, setMainImageIndex] = useState(0);

  const [videos, setVideos] = useState([]);
  const [videoPreviews, setVideoPreviews] = useState([]);

  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    nameHi: "",
    descriptionHi: "",
    category: "",
    subcategory: "",
    price: "",
    oldPrice: "",
    stock: "",
    featured: false,
    isActive: true,
    isTrending: false,
    trendingRank: 0,
    optimizeImages: true,
    fabric: "",
    size: "",
    gsm: "",
    washCare: "",
    brand: "",
    countryOfOrigin: "",
    isReturnable: true,
    returnPeriodDays: "",
    restockAlertEnabled: false,
    restockAlertQuantity: "",
    purchasePrice: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
  });

  const loadCategories = async () => {
    const response = await getCategories();

    if (response.success) {
      setCategories(response.categories);
    }
  };

  const loadSubcategories = async () => {
    const response = await getSubcategories();

    if (response.success) {
      setSubcategories(response.subcategories);
    }
  };

  useEffect(() => {
    loadCategories();
    loadSubcategories();
  }, []);

  const subcategoryOptions = subcategories.filter(
    (sub) => sub.category?._id === formData.category,
  );

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "category" ? { subcategory: "" } : {}),
    }));
  };

  const handleImages = (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    setImages(files);
    setPreviews(files.map((file) => URL.createObjectURL(file)));
    setMainImageIndex(0);
  };

  const handleVideos = (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    setVideos(files);
    setVideoPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (images.length === 0) {
      alert("Please select at least one product image");
      return;
    }

    const data = new FormData();

    data.append("name", formData.name);
    data.append("description", formData.description);
    data.append("nameHi", formData.nameHi);
    data.append("descriptionHi", formData.descriptionHi);
    data.append("category", formData.category);
    data.append("subcategory", formData.subcategory);
    data.append("price", formData.price);
    data.append("oldPrice", formData.oldPrice);
    data.append("stock", formData.stock);
    data.append("featured", formData.featured);
    data.append("isActive", formData.isActive);
    data.append("isTrending", formData.isTrending);
    data.append("trendingRank", formData.trendingRank);
    data.append("mainImageIndex", mainImageIndex);
    data.append("optimizeImages", formData.optimizeImages);
    data.append("fabric", formData.fabric);
    data.append("size", formData.size);
    data.append("gsm", formData.gsm);
    data.append("washCare", formData.washCare);
    data.append("brand", formData.brand);
    data.append("countryOfOrigin", formData.countryOfOrigin);
    data.append("isReturnable", formData.isReturnable);
    data.append("returnPeriodDays", formData.returnPeriodDays);
    data.append("restockAlertEnabled", formData.restockAlertEnabled);
    data.append("restockAlertQuantity", formData.restockAlertQuantity);
    data.append("purchasePrice", formData.purchasePrice);
    data.append("purchaseDate", formData.purchaseDate);

    images.forEach((file) => data.append("images", file));
    videos.forEach((file) => data.append("videos", file));

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

        <div className="form-group">
          <label>Product Name (Hindi, optional)</label>

          <input
            type="text"
            name="nameHi"
            placeholder="हिंदी में प्रोडक्ट का नाम"
            value={formData.nameHi}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Description (Hindi, optional)</label>

          <textarea
            rows="5"
            name="descriptionHi"
            placeholder="हिंदी में विवरण"
            value={formData.descriptionHi}
            onChange={handleChange}
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

        <div className="form-row">
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

        <div className="form-row">
          <div className="form-group">
            <label>Fabric (optional)</label>

            <input
              type="text"
              name="fabric"
              placeholder="e.g. 100% Cotton"
              value={formData.fabric}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Size (optional)</label>

            <input
              type="text"
              name="size"
              placeholder="e.g. 90 x 100 inches"
              value={formData.size}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>GSM (optional)</label>

            <input
              type="text"
              name="gsm"
              placeholder="e.g. 180 GSM"
              value={formData.gsm}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Wash Care (optional)</label>

            <input
              type="text"
              name="washCare"
              placeholder="e.g. Machine wash cold"
              value={formData.washCare}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Brand (optional)</label>

            <input
              type="text"
              name="brand"
              placeholder="e.g. Mittal Collections"
              value={formData.brand}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Country of Origin (optional)</label>

            <input
              type="text"
              name="countryOfOrigin"
              placeholder="e.g. India"
              value={formData.countryOfOrigin}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Product Images</label>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImages}
            required
          />
        </div>

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              name="optimizeImages"
              checked={formData.optimizeImages}
              onChange={handleChange}
            />
            Reduce image size (best quality)
          </label>
        </div>

        {previews.length > 0 && (
          <div className="image-thumb-grid">
            {previews.map((src, index) => (
              <div
                key={src}
                className={`image-thumb${
                  index === mainImageIndex ? " is-main" : ""
                }`}
                onClick={() => setMainImageIndex(index)}
              >
                <img src={src} alt={`Preview ${index + 1}`} />
                {index === mainImageIndex && (
                  <span className="main-badge">Main</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label>Product Videos (optional, max 2)</label>

          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            multiple
            onChange={handleVideos}
          />
        </div>

        {videoPreviews.length > 0 && (
          <div className="image-thumb-grid">
            {videoPreviews.map((src) => (
              <div key={src} className="image-thumb">
                <video src={src} muted />
              </div>
            ))}
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

          <label>
            <input
              type="checkbox"
              name="isTrending"
              checked={formData.isTrending}
              onChange={handleChange}
            />
            Show in Trending
          </label>

          <label>
            <input
              type="checkbox"
              name="isReturnable"
              checked={formData.isReturnable}
              onChange={handleChange}
            />
            Returnable
          </label>

          <label>
            <input
              type="checkbox"
              name="restockAlertEnabled"
              checked={formData.restockAlertEnabled}
              onChange={handleChange}
            />
            Custom Restock Alert
          </label>
        </div>

        {formData.isReturnable && (
          <div className="form-row">
            <div className="form-group">
              <label>Custom Return Period (days, optional)</label>

              <input
                type="number"
                name="returnPeriodDays"
                min="0"
                placeholder="Leave blank to use site default"
                value={formData.returnPeriodDays}
                onChange={handleChange}
              />
            </div>
          </div>
        )}

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

        {formData.restockAlertEnabled && (
          <div className="form-row">
            <div className="form-group">
              <label>Alert when stock falls to or below</label>

              <input
                type="number"
                name="restockAlertQuantity"
                placeholder="e.g. 10"
                value={formData.restockAlertQuantity}
                onChange={handleChange}
                min="0"
                required
              />
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Purchase Price / Cost (internal, not shown to customers)</label>

            <input
              type="number"
              name="purchasePrice"
              placeholder="What you paid for it"
              value={formData.purchasePrice}
              onChange={handleChange}
              min="0"
            />
          </div>

          <div className="form-group">
            <label>Purchase Date</label>

            <input
              type="date"
              name="purchaseDate"
              value={formData.purchaseDate}
              onChange={handleChange}
            />
          </div>
        </div>

        <button className="save-btn" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Product"}
        </button>
      </form>
    </div>
  );
}

export default AddProduct;
