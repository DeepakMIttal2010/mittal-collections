import "./Testimonials.css";
import { FaStar, FaQuoteLeft } from "react-icons/fa";
import testimonials from "../../data/testimonials";

function Testimonials() {
  return (
    <section className="testimonials">
      <div className="container">
        <div className="section-title">
          <h2>What Our Customers Say</h2>
          <p>Trusted by hundreds of happy customers across India.</p>
        </div>

        <div className="testimonial-grid">
          {testimonials.map((item) => (
            <div className="testimonial-card" key={item.id}>
              <FaQuoteLeft className="quote-icon" />

              <div className="rating">
                {[...Array(item.rating)].map((_, index) => (
                  <FaStar key={index} />
                ))}
              </div>

              <p className="review">"{item.review}"</p>

              <h4>{item.name}</h4>

              <span>{item.city}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Testimonials;
