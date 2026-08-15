import { useEffect, useState } from "react";
import { FaTags, FaTruck, FaUndoAlt, FaMoneyBillWave, FaWhatsapp } from "react-icons/fa";

import "./TrustBar.css";
import { useLanguage } from "../../context/LanguageContext";
import { getSiteSettings } from "../../services/settingsService";
import { toWhatsAppNumber } from "../../utils/whatsapp";

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
    title: "Fast Local Delivery",
    titleHi: "तेज़ लोकल डिलीवरी",
    subtitle: "on eligible orders",
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
    title: "Secure Payment",
    titleHi: "सुरक्षित पेमेंट",
    subtitle: "COD or online",
    subtitleHi: "COD या ऑनलाइन",
  },
];

function TrustBar() {
  const { t } = useLanguage();
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const loadPhone = async () => {
      const response = await getSiteSettings();

      if (response.success && response.settings.phone) {
        setPhone(response.settings.phone);
      }
    };

    loadPhone();
  }, []);

  const waLink = phone
    ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
        "Hi, I have a question about a product on Mittal Collections.",
      )}`
    : null;

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

        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="trust-bar-item-link">
            <div className="trust-bar-item">
              <div className="trust-bar-icon">
                <FaWhatsapp />
              </div>
              <div className="trust-bar-title">
                {t("WhatsApp / Call Support", "व्हाट्सएप / कॉल सहायता")}
              </div>
              <div className="trust-bar-subtitle">{phone}</div>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}

export default TrustBar;
