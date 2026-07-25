import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories } from "../../services/categoryService";
import "./Categories.css";

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="categories">
        <div className="container">
          <h2>Shop by Category</h2>
          <p>Loading categories...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="categories">
      <div className="container">
        <h2>Shop by Category</h2>

        <div className="categories-grid">
          {categories.map((category) => (
            <Link
              key={category._id}
              to={`/category/${category.slug}`}
              className="category-card"
            >
              <img
                src={`http://localhost:5000${category.image}`}
                alt={category.name}
                className="category-image"
              />

              <h3>{category.name}</h3>

              {category.description && <p>{category.description}</p>}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Categories;
