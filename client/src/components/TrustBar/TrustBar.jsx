import { useEffect, useState } from "react";
import { FaTags, FaTruck, FaUndoAlt, FaMoneyBillWave } from "react-icons/fa";

import { getSiteSettings } from "../../services/settingsService";

import "./TrustBar.css";

function TrustBar() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(499);

  useEffect(() => {
    const loadSettings = async () => {
      const response = await getSiteSettings();

      if (response.success && response.settings.freeShippingThreshold) {
        setFreeShippingThreshold(response.settings.freeShippingThreshold);
      }
    };

    loadSettings();
  }, []);

  const items = [
    {
      icon: <FaTags />,
      title: "Up to 50% OFF",
      subtitle: "Select collections",
    },
    {
      icon: <FaTruck />,
      title: "Free Delivery",
      subtitle: `Above ₹${freeShippingThreshold}`,
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

  return (
    <div className="trust-bar-wrap">
      <div className="trust-bar-card">
        {items.map((item) => (
          <div className="trust-bar-item" key={item.title}>
            <div className="trust-bar-icon">{item.icon}</div>
            <div className="trust-bar-title">{item.title}</div>
            <div className="trust-bar-subtitle">{item.subtitle}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TrustBar;
