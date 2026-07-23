import "./WhyChooseUs.css";
import { FaAward, FaTruck, FaTags, FaHeadset } from "react-icons/fa";

function WhyChooseUs() {
  const reasons = [
    {
      icon: <FaAward />,
      title: "Premium Quality",
      text: "Carefully selected fabrics and materials for lasting comfort.",
    },
    {
      icon: <FaTruck />,
      title: "Fast Delivery",
      text: "Quick and reliable delivery across India.",
    },
    {
      icon: <FaTags />,
      title: "Best Prices",
      text: "Premium products at competitive prices.",
    },
    {
      icon: <FaHeadset />,
      title: "Customer Support",
      text: "Friendly support whenever you need assistance.",
    },
  ];

  return (
    <section className="why-choose-us">
      <div className="container">
        <div className="section-title">
          <h2>Why Choose Mittal Collections?</h2>
          <p>
            We bring premium quality, elegant designs and trusted service to
            every home.
          </p>
        </div>

        <div className="why-grid">
          {reasons.map((item, index) => (
            <div className="why-card" key={index}>
              <div className="why-icon">{item.icon}</div>

              <h3>{item.title}</h3>

              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseUs;
