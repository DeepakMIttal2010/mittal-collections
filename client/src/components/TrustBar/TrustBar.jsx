import { useEffect, useState } from "react";
import { FaTruck, FaUndoAlt, FaLock, FaMoneyBillWave, FaWhatsapp } from "react-icons/fa";

import "./TrustBar.css";
import { useLanguage } from "../../context/LanguageContext";
import { getSiteSettings } from "../../services/settingsService";
import { toWhatsAppNumber } from "../../utils/whatsapp";

// An "Up to 50% OFF" item used to lead this list. It relied on internal
// reference prices shown as MRP, and discounts now show only against a
// verified printed MRP (utils/verifiedMrp.js), so it was removed rather
// than replaced with a claim that isn't true for every product.
const items = [
  {
    icon: <FaTruck />,
    title: "Fast Local Delivery",
    titleHi: "तेज़ लोकल डिलीवरी",
    subtitle: "on eligible orders",
    subtitleHi: "योग्य ऑर्डर पर",
  },
  {
    icon: <FaUndoAlt />,
    // Qualified: some products are non-returnable (trust-claims audit
    // 2026-11-24, WC-02); no absolute percentage claim (WC-04).
    title: "Returns",
    titleHi: "रिटर्न",
    subtitle: "On eligible products",
    subtitleHi: "योग्य प्रोडक्ट्स पर",
  },
  {
    icon: <FaLock />,
    title: "Secure Payment",
    titleHi: "सुरक्षित पेमेंट",
    subtitle: "Secure checkout",
    subtitleHi: "सुरक्षित चेकआउट",
  },
  {
    icon: <FaMoneyBillWave />,
    title: "Cash on Delivery",
    titleHi: "कैश ऑन डिलीवरी",
    // Qualified like the rest of the site: COD isn't offered on every
    // PIN code/order (see the delivery-claims guard).
    subtitle: "COD may be available for eligible PIN codes and orders.",
    subtitleHi: "COD चुनिंदा PIN codes और orders पर उपलब्ध हो सकता है।",
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
