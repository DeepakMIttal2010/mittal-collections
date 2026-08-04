import { imgUrl } from "../../services/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories } from "../../services/categoryService";
import Skeleton from "../Skeleton";

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = async () => {
    try {
      const response = await getCategories();

      if (response.success) {
        setCategories(response.categories);
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  return (
    <section className="py-20 bg-white" id="shop-categories">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            Shop by Category
          </h2>
          <p className="text-slate-500">
            Explore our curated collection for every corner of your home.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="group block rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100 hover:shadow-xl transition-shadow duration-300"
              >
                <div className="relative h-72 overflow-hidden">
                  <img
                    src={`${imgUrl(category.image)}`}
                    alt={category.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <h3 className="text-xl font-semibold mb-1">
                      {category.name}
                    </h3>

                    {category.description && (
                      <p className="text-sm text-white/80 line-clamp-1">
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Categories;
