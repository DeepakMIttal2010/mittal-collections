import { useState } from "react";
import { FaTimes } from "react-icons/fa";

const DISMISS_KEY = "mc_delivery_banner_dismissed";

function DeliveryOfferBanner() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="relative bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold">
      <div className="max-w-7xl mx-auto px-10 py-2 flex items-center justify-center gap-2 text-center">
        <span className="shrink-0">🔔</span>
        <span>
          <strong>धमाकेदार ऑफर:</strong> वसुंधरा और उसके 10 किमी के दायरे में
          (वैशाली, इंदिरापुरम, साहिबाबाद) <strong>FREE HOME DELIVERY!</strong>{" "}
          📦🚀
        </span>
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
