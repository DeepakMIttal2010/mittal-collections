import { useState } from "react";
import { FaTimes } from "react-icons/fa";

import { useIsGhaziabadVisitor } from "../hooks/useIsGhaziabadVisitor";
import { useLanguage } from "../context/LanguageContext";

const DISMISS_KEY = "mc_delivery_banner_dismissed";

function DeliveryOfferBanner() {
  const isGhaziabad = useIsGhaziabadVisitor();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleCheckArea = (e) => {
    e.preventDefault();
    document
      .getElementById("delivery-areas")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (dismissed) return null;

  return (
    <div className="relative bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold">
      <div className="max-w-7xl mx-auto px-10 py-2 flex items-center justify-center gap-2 text-center flex-wrap">
        <span className="shrink-0">🚚</span>
        {isGhaziabad ? (
          <>
            <span>
              <strong>{t("FAST DELIVERY within 24 Hours", "24 घंटे में तेज़ डिलीवरी")}</strong>{" "}
              {t(
                "— Ghaziabad*: Vasundhara, Vaishali, Indirapuram & आसपास",
                "— गाज़ियाबाद*: वसुंधरा, वैशाली, इंदिरापुरम & आसपास",
              )}
            </span>
            <a
              href="#delivery-areas"
              onClick={handleCheckArea}
              className="underline underline-offset-2 whitespace-nowrap hover:text-amber-100 transition-colors"
            >
              {t("Check your area →", "अपना क्षेत्र जांचें →")}
            </a>
          </>
        ) : (
          <span>
            <strong>{t("PAN-INDIA DELIVERY", "पूरे भारत में डिलीवरी")}</strong>{" "}
            {t(
              "— usually 3-7 business days (same-day within 24 Hours in Ghaziabad)",
              "— आमतौर पर 3-7 कार्य दिवस (गाज़ियाबाद में 24 घंटे में सेम-डे)",
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("Dismiss", "बंद करें")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
      >
        <FaTimes />
      </button>
    </div>
  );
}

export default DeliveryOfferBanner;
