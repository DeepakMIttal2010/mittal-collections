import { useEffect, useState } from "react";
import { FaStar, FaQuoteLeft, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { getTestimonials } from "../../services/testimonialService";
import { useLanguage } from "../../context/LanguageContext";

const ITEMS_PER_PAGE = 3;

function Testimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    const loadTestimonials = async () => {
      const data = await getTestimonials();
      setTestimonials(data.testimonials);
      setLoading(false);
    };

    loadTestimonials();
  }, []);

  const totalPages = Math.ceil(testimonials.length / ITEMS_PER_PAGE);
  const visible = testimonials.slice(
    page * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );

  if (loading || testimonials.length === 0) {
    return null;
  }

  return (
    <section className="bg-slate-50 py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
            {t("What Our Customers Say", "हमारे ग्राहक क्या कहते हैं")}
          </h2>
          <p className="text-slate-500">
            {t(
              "Trusted by hundreds of happy customers across India.",
              "पूरे भारत में सैकड़ों खुश ग्राहकों का भरोसा।",
            )}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={page === 0}
            className="shrink-0 w-10 h-10 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:border-amber-500 hover:text-amber-600 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <FaChevronLeft />
          </button>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((item) => (
              <div
                key={item._id}
                className="bg-white rounded-2xl shadow-sm p-8 transition-transform hover:-translate-y-1 hover:shadow-md"
              >
                <FaQuoteLeft className="text-3xl text-amber-500 mb-4" />

                <div className="flex gap-1 text-amber-500 mb-4">
                  {[...Array(item.rating)].map((_, index) => (
                    <FaStar key={index} />
                  ))}
                </div>

                <p className="text-slate-600 italic mb-6">"{item.review}"</p>

                <h4 className="font-semibold text-slate-800">{item.name}</h4>
                <span className="text-sm text-slate-500">{item.city}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={page >= totalPages - 1}
            className="shrink-0 w-10 h-10 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:border-amber-500 hover:text-amber-600 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <FaChevronRight />
          </button>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {[...Array(totalPages)].map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-label={`Go to page ${index + 1}`}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  page === index ? "bg-amber-500" : "bg-slate-300"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Testimonials;
