import { FaTags, FaTruck, FaUndoAlt, FaMoneyBillWave } from "react-icons/fa";

import "./TrustBar.css";

const items = [
  {
    icon: <FaTags />,
    title: "Up to 50% OFF",
    subtitle: "Select collections",
  },
  {
    icon: <FaTruck />,
    title: "Free Delivery",
    subtitle: "on eligible orders.",
  },
  {
    icon: <FaUndoAlt />,
    title: "Easy Returns",
    subtitle: "Hassle-free",
  },
  {
    icon: <FaMoneyBillWave />,
    title: "COD Available",
    subtitle: "Pay at doorstep",
  },
];

function TrustBar() {
  return (
    <div className="trust-bar-wrap">
      <div className="trust-bar-card">
        {items.map((item) => (
          <div className="trust-bar-item" key={item.title}>
            <div className="trust-bar-icon">{item.icon}</div>
            <div className="trust-bar-title">{item.title}</div>
            {item.subtitle && (
              <div className="trust-bar-subtitle">{item.subtitle}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TrustBar;
