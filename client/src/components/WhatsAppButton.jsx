import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";

import { getSiteSettings } from "../services/settingsService";

const toWhatsAppNumber = (phone) => {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;

  return digits;
};

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
    <a
      href={waLink}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full bg-[#25D366] hover:bg-[#1ebe5a] text-white shadow-lg flex items-center justify-center transition-colors text-2xl"
    >
      <FaWhatsapp />
    </a>
  );
}

export default WhatsAppButton;
