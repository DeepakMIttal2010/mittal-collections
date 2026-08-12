import "./TopBar.css";

import { useLanguage } from "../../context/LanguageContext";

function TopBar() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="topbar">
      <div className="container d-flex justify-content-between align-items-center">
        <div className="left">
          {t("🚚 FREE SHIPPING on orders above ₹999", "🚚 ₹999 से ऊपर के ऑर्डर पर मुफ्त शिपिंग")}
        </div>

        <div className="center">
          <span>{t("Premium Quality", "प्रीमियम क्वालिटी")}</span>
          <span>|</span>
          <span>{t("Best Prices", "बेहतरीन कीमतें")}</span>
          <span>|</span>
          <span>{t("Easy Returns", "आसान रिटर्न")}</span>
        </div>

        <div className="right">
          <span>{t("Track Order", "ऑर्डर ट्रैक करें")}</span>
          <span>|</span>
          <span>{t("Help & Support", "सहायता")}</span>
          <span>|</span>
          <span className="lang-toggle">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={language === "en" ? "lang-active" : ""}
            >
              English
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => setLanguage("hi")}
              className={language === "hi" ? "lang-active" : ""}
            >
              हिंदी
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
