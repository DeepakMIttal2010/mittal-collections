import { imgUrl } from "../../services/api";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

const titleCase = (str) =>
  str.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1));

function SubcategoryRow({ category, groupLabel, items, activeSubcategory }) {
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  const scroll = (direction) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollBy({
      left: direction === "next" ? 280 : -280,
      behavior: "smooth",
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-bold text-slate-900">
          {category.name} by {titleCase(groupLabel)}
        </h3>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("prev")}
            aria-label="Previous"
            className="w-8 h-8 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
          >
            <FaChevronLeft className="text-xs" />
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            aria-label="Next"
            className="w-8 h-8 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
          >
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto scroll-smooth pb-2"
      >
        {items.map((sub) => {
          const isActive = activeSubcategory?._id === sub._id;
          const imageUrl = sub.image || category.image;

          return (
            <button
              key={sub._id}
              type="button"
              onClick={() => navigate(`/category/${category.slug}/${sub.slug}`)}
              className="shrink-0 w-52 text-left group"
            >
              <div
                className={`rounded-xl overflow-hidden bg-slate-100 transition-shadow ${
                  isActive ? "ring-2 ring-amber-500" : "group-hover:shadow-md"
                }`}
              >
                <div className="aspect-square">
                  {imageUrl && (
                    <img
                      src={`${imgUrl(imageUrl)}`}
                      alt={sub.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="text-center py-3 px-2">
                  <p className="text-xl font-bold uppercase tracking-wide text-slate-500 leading-tight">
                    {sub.name}
                  </p>

                  {sub.subtitle && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sub.subtitle}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SubcategoryRow;
