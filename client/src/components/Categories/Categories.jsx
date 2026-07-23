import "./Categories.css";
import { Link } from "react-router-dom";
import categories from "../../data/categories";

function Categories() {
  return (
    <section className="categories-section">
      <div className="container">
        <div className="section-title">
          <h2>Shop by Categories</h2>
          <p>Explore our premium collection for every corner of your home.</p>
        </div>

        <div className="categories-grid">
          {categories.map((category) => (
            <Link
              to={category.path}
              key={category.id}
              className="category-card"
            >
              <img src={category.image} alt={category.name} />

              <div className="category-overlay">
                <h3>{category.name}</h3>

                <button>Shop Now</button>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Categories;
