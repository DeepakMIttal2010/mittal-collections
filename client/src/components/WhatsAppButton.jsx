import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa6";

import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";
import { useLanguage } from "../context/LanguageContext";

function WhatsAppButton() {
  const [phone, setPhone] = useState("");
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    const load = async () => {
      const response = await getSiteSettings();

      if (response.success && response.settings.phone) {
        setPhone(response.settings.phone);
      }
    };

    load();
  }, []);

  if (!phone) return null;

  // This button floats on every page (not just product pages), so it
  // can't name a specific product — but including the page the customer
  // was actually looking at gives whoever answers a real starting point
  // instead of a bare "I have a question" with nothing to go on.
  const pageUrl = `${window.location.origin}${location.pathname}${location.search}`;
  const message =
    location.pathname === "/"
      ? t(
          "Hi, I have a question about a product on Mittal Collections.",
          "नमस्ते, मुझे मित्तल कलेक्शंस के एक प्रोडक्ट के बारे में सवाल है।",
        )
      : t(`Hi, I have a question about this: ${pageUrl}`, `नमस्ते, मुझे इसके बारे में सवाल है: ${pageUrl}`);

  const waLink = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 sm:left-6 z-50 flex flex-col items-start gap-2">
      <span className="bg-white text-slate-700 text-xs font-medium px-3 py-1.5 rounded-lg shadow-md">
        {t("Need Help?", "मदद चाहिए?")}
      </span>

      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("Chat with us on WhatsApp", "WhatsApp पर हमसे बात करें")}
        className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] hover:bg-[#1ebe5a] text-white shadow-lg rounded-full transition-colors"
      >
        <FaWhatsapp className="text-2xl" />
      </a>
    </div>
  );
}

export default WhatsAppButton;
