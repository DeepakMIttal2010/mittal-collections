import "./WhyChooseUs.css";
import {
  FaAward,
  FaTruck,
  FaCamera,
  FaWhatsapp,
  FaLock,
  FaUndoAlt,
} from "react-icons/fa";
import { useLanguage } from "../../context/LanguageContext";

function WhyChooseUs() {
  const { t } = useLanguage();

  const reasons = [
    {
      icon: <FaCamera />,
      title: "Genuine Product Images",
      titleHi: "असली प्रोडक्ट फोटो",
      text: "Real photos of every product — no stock images, so what you see is exactly what you get.",
      textHi: "हर प्रोडक्ट की असली फोटो — कोई स्टॉक इमेज नहीं, जो दिखे वही मिलेगा।",
    },
    {
      icon: <FaAward />,
      title: "Quality Checked Products",
      titleHi: "क्वालिटी चेक्ड प्रोडक्ट्स",
      text: "Carefully selected fabrics, checked for quality before they ship to you.",
      textHi: "सावधानी से चुने गए फैब्रिक, भेजने से पहले क्वालिटी चेक किए जाते हैं।",
    },
    {
      icon: <FaTruck />,
      title: "Pan-India Delivery",
      titleHi: "पूरे भारत में डिलीवरी",
      text: "Delivered anywhere in India, with fast 24-hour delivery in Ghaziabad.",
      textHi: "पूरे भारत में डिलीवरी, ग़ाज़ियाबाद में 24 घंटे में तेज़ डिलीवरी।",
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
