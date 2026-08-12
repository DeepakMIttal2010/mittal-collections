import "./WhyChooseUs.css";
import {
  FaAward,
  FaTruck,
  FaTags,
  FaHeadset,
  FaLock,
  FaUndoAlt,
} from "react-icons/fa";
import { useLanguage } from "../../context/LanguageContext";

function WhyChooseUs() {
  const { t } = useLanguage();

  const reasons = [
    {
      icon: <FaAward />,
      title: "Premium Quality",
      titleHi: "प्रीमियम क्वालिटी",
      text: "Carefully selected fabrics and materials for lasting comfort.",
      textHi: "लंबे समय तक आराम के लिए सावधानी से चुने गए फैब्रिक और सामग्री।",
    },
    {
      icon: <FaTruck />,
      title: "Fast Delivery",
      titleHi: "तेज़ डिलीवरी",
      text: "Quick and reliable delivery across India.",
      textHi: "पूरे भारत में तेज़ और भरोसेमंद डिलीवरी।",
    },
    {
      icon: <FaTags />,
      title: "Best Prices",
      titleHi: "बेहतरीन कीमतें",
      text: "Premium products at competitive prices.",
      textHi: "प्रतिस्पर्धी कीमतों पर प्रीमियम प्रोडक्ट्स।",
    },
    {
      icon: <FaHeadset />,
      title: "Customer Support",
      titleHi: "ग्राहक सहायता",
      text: "Friendly support whenever you need assistance.",
      textHi: "जब भी ज़रूरत हो, मित्रवत सहायता उपलब्ध।",
    },
    {
      icon: <FaLock />,
      title: "Secure Payment",
      titleHi: "सुरक्षित भुगतान",
      text: "100% safe and secure checkout.",
      textHi: "100% सुरक्षित चेकआउट।",
    },
    {
      icon: <FaUndoAlt />,
      title: "Easy Returns",
      titleHi: "आसान रिटर्न",
      text: "Easy return policy.",
      textHi: "आसान रिटर्न नीति।",
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

              <p>{t(item.text, item.textHi)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseUs;
