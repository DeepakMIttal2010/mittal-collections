import "./WhyChooseUs.css";
import {
  FaAward,
  FaTruck,
  FaWhatsapp,
  FaLock,
  FaUndoAlt,
} from "react-icons/fa";
import { Link } from "react-router-dom";

import { useLanguage } from "../../context/LanguageContext";
import { RETURNS_POLICY_PATH } from "../../utils/ghaziabadStoreCopy";

// Homepage trust-claims audit 2026-11-24: the card promising only genuine
// photos for every product was removed (about half the catalogue carries
// an AI-enhanced/catalog image note, shown on the product page); returns
// are qualified as "eligible products"; no absolute percentage claims.
function WhyChooseUs() {
  const { t } = useLanguage();

  const reasons = [
    {
      icon: <FaAward />,
      title: "Quality Checked Products",
      titleHi: "क्वालिटी चेक्ड प्रोडक्ट्स",
      text: "Carefully selected fabrics, checked for quality before they ship to you.",
      textHi: "सावधानी से चुने गए फैब्रिक, भेजने से पहले क्वालिटी चेक किए जाते हैं।",
    },
    {
      icon: <FaTruck />,
      title: "Delivery in Uttar Pradesh",
      titleHi: "उत्तर प्रदेश में डिलीवरी",
      text: "Available only to eligible PIN codes — check your PIN code before ordering. Delivery within 24 hours in selected Ghaziabad PIN codes, subject to product availability.",
      textHi: "डिलीवरी केवल चुनिंदा PIN codes पर उपलब्ध है — ऑर्डर करने से पहले अपना PIN code जाँचें। गाजियाबाद के चुनिंदा PIN कोड पर 24 घंटे के अंदर डिलीवरी, उत्पाद की उपलब्धता के अनुसार।",
    },
    {
      icon: <FaWhatsapp />,
      title: "WhatsApp Customer Support",
      titleHi: "व्हाट्सएप कस्टमर सपोर्ट",
      text: "Reach us directly on WhatsApp for help, before or after your order.",
      textHi: "ऑर्डर से पहले या बाद में, किसी भी मदद के लिए सीधे व्हाट्सएप पर संपर्क करें।",
    },
    {
      icon: <FaLock />,
      title: "Secure Payment",
      titleHi: "सुरक्षित भुगतान",
      text: "Secure checkout.",
      textHi: "सुरक्षित चेकआउट।",
    },
    {
      icon: <FaUndoAlt />,
      // Same wording as the Ghaziabad store page (WC-02).
      title: "Returns",
      titleHi: "रिटर्न",
      text: "Returns are available on eligible products. Please check our ",
      textHi: "योग्य प्रोडक्ट्स पर रिटर्न उपलब्ध है। प्रोडक्ट के हिसाब से योग्यता और पूरी जानकारी के लिए हमारी ",
      link: { text: "Returns Policy", textHi: "रिटर्न पॉलिसी", to: RETURNS_POLICY_PATH },
      textAfter: " for product-wise eligibility and details.",
      textAfterHi: " देखें।",
    },
  ];

  return (
    <section className="why-choose-us">
      <div className="container">
        <div className="section-title">
          <h2>{t("Why Choose Mittal Collections?", "मित्तल कलेक्शंस क्यों चुनें?")}</h2>
          <p>
            {t(
              "We bring premium quality, elegant designs and trusted service to every home.",
              "हम हर घर तक प्रीमियम क्वालिटी, स्टाइलिश डिज़ाइन और भरोसेमंद सेवा पहुंचाते हैं।",
            )}
          </p>
        </div>

        <div className="why-grid">
          {reasons.map((item, index) => (
            <div className="why-card" key={index}>
              <div className="why-icon">{item.icon}</div>

              <h3>{t(item.title, item.titleHi)}</h3>

              <p>
                {t(item.text, item.textHi)}
                {item.link && (
                  <Link to={item.link.to} className="why-link">
                    {t(item.link.text, item.link.textHi)}
                  </Link>
                )}
                {item.textAfter && t(item.textAfter, item.textAfterHi)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseUs;
