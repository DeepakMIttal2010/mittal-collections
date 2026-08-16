import { useEffect, useState } from "react";
import { FaStar, FaQuoteLeft } from "react-icons/fa";

import { getTestimonials } from "../../services/testimonialService";
import { useLanguage } from "../../context/LanguageContext";
import "./Testimonials.css";

// Seconds of scroll per card — keeps the per-card pace roughly constant
// regardless of how many testimonials exist, rather than a fixed total
// duration that would speed up as more get added.
const SECONDS_PER_CARD = 8;
const MIN_DURATION_S = 24;

function Testimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const loadTestimonials = async () => {
      const data = await getTestimonials();
      setTestimonials(data.testimonials);
      setLoading(false);
    };

    loadTestimonials();
  }, []);

  if (loading || testimonials.length === 0) {
    return null;
  }

  // Rendered twice back-to-back so the CSS animation can scroll exactly
  // one set's width (translateX(-50%) of the doubled track) and loop
  // seamlessly — the moment it resets to 0%, the content lines up
  // identically, so the reset is invisible.
  const trackItems = [...testimonials, ...testimonials];
  const durationS = Math.max(testimonials.length * SECONDS_PER_CARD, MIN_DURATION_S);

  return (
    <section className="bg-slate-50 py-20 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
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
      </div>

      <div className="testimonial-marquee">
        <div
          className="testimonial-marquee-track"
          style={{ animationDuration: `${durationS}s` }}
        >
          {trackItems.map((item, index) => (
            <div
              key={`${item._id}-${index}`}
              className="testimonial-card bg-white rounded-2xl shadow-sm p-8"
            >
              <FaQuoteLeft className="text-3xl text-amber-500 mb-4" />

              <div className="flex gap-1 text-amber-500 mb-4">
                {[...Array(item.rating)].map((_, i) => (
                  <FaStar key={i} />
                ))}
              </div>

              <p className="text-slate-600 italic mb-6">"{item.review}"</p>

              <h4 className="font-semibold text-slate-800">{item.name}</h4>
              <span className="text-sm text-slate-500">{item.city}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Testimonials;
