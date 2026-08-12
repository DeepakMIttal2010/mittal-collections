import { FaTags, FaTruck, FaUndoAlt, FaMoneyBillWave } from "react-icons/fa";

import "./TrustBar.css";
import { useLanguage } from "../../context/LanguageContext";

const items = [
  {
    icon: <FaTags />,
    title: "Up to 50% OFF",
    titleHi: "50% तक की छूट",
    subtitle: "Select collections",
    subtitleHi: "चुनिंदा कलेक्शन पर",
  },
  {
    icon: <FaTruck />,
    title: "Free Delivery",
    titleHi: "मुफ्त डिलीवरी",
    subtitle: "on eligible orders.",
    subtitleHi: "योग्य ऑर्डर पर",
  },
  {
    icon: <FaUndoAlt />,
    title: "Easy Returns",
    titleHi: "आसान रिटर्न",
    subtitle: "Hassle-free",
    subtitleHi: "बिना किसी झंझट के",
  },
  {
    icon: <FaMoneyBillWave />,
    title: "COD Available",
    titleHi: "कैश ऑन डिलीवरी उपलब्ध",
    subtitle: "Pay at doorstep",
    subtitleHi: "घर पर पेमेंट करें",
  },
];

function TrustBar() {
  const { t } = useLanguage();

  return (
    <div className="trust-bar-wrap">
      <div className="trust-bar-card">
        {items.map((item) => (
          <div className="trust-bar-item" key={item.title}>
            <div className="trust-bar-icon">{item.icon}</div>
            <div className="trust-bar-title">{t(item.title, item.titleHi)}</div>
            {item.subtitle && (
              <div className="trust-bar-subtitle">
                {t(item.subtitle, item.subtitleHi)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TrustBar;
