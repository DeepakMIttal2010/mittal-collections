import "./Features.css";
import { FaTruck, FaGem, FaLock, FaUndoAlt } from "react-icons/fa";

function Features() {
  const features = [
    {
      icon: <FaTruck />,
      title: "Free Shipping",
      text: "Free delivery on eligible orders.",
    },
    {
      icon: <FaGem />,
      title: "Premium Quality",
      text: "Crafted with the finest materials.",
    },
    {
      icon: <FaLock />,
      title: "Secure Payment",
      text: "100% safe and secure checkout.",
    },
    {
      icon: <FaUndoAlt />,
      title: "Easy Returns",
      text: "Easy return policy.",
    },
  ];

  return (
    <section className="features">
      <div className="container">
        <div className="features-grid">
          {features.map((item, index) => (
            <div className="feature-card" key={index}>
              <div className="feature-icon">{item.icon}</div>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Features;
