import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";

import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";

function WhatsAppButton() {
  const [phone, setPhone] = useState("");

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

  const waLink = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
    "Hi, I have a question about a product on Mittal Collections.",
  )}`;

  return (
    <div className="fixed bottom-6 left-4 sm:left-6 z-50 flex flex-col items-start gap-2">
      <span className="bg-white text-slate-700 text-xs font-medium px-3 py-1.5 rounded-lg shadow-md">
        Need Help?
      </span>

      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white shadow-lg rounded-full pl-3 pr-4 py-2.5 sm:pl-4 sm:pr-5 sm:py-3 transition-colors text-sm font-semibold whitespace-nowrap"
      >
        <FaWhatsapp className="text-xl" />
        WhatsApp Now
      </a>
    </div>
  );
}

export default WhatsAppButton;
