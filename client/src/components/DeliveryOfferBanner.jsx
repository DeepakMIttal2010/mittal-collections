import { useState } from "react";
import { FaTimes } from "react-icons/fa";

import { useIsGhaziabadVisitor } from "../hooks/useIsGhaziabadVisitor";

const DISMISS_KEY = "mc_delivery_banner_dismissed";

function DeliveryOfferBanner() {
  const isGhaziabad = useIsGhaziabadVisitor();
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
              <strong>FAST DELIVERY within 24 Hours</strong> — Ghaziabad*:
              Vasundhara, Vaishali, Indirapuram & आसपास
            </span>
            <a
              href="#delivery-areas"
              onClick={handleCheckArea}
              className="underline underline-offset-2 whitespace-nowrap hover:text-amber-100 transition-colors"
            >
              Check your area →
            </a>
          </>
        ) : (
          <span>
            <strong>PAN-INDIA DELIVERY</strong> — usually 3-7 business days
            (same-day within 24 Hours in Ghaziabad)
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
      >
        <FaTimes />
      </button>
    </div>
  );
}

export default DeliveryOfferBanner;
