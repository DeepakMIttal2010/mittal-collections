import { useEffect, useState } from "react";
import { FaArrowUp } from "react-icons/fa";
import { useLanguage } from "../context/LanguageContext";

const SHOW_AFTER_PX = 400;

function BackToTopButton() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };

    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label={t("Back to top", "ऊपर जाएं")}
      className="fixed bottom-20 md:bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg flex items-center justify-center transition-colors"
    >
      <FaArrowUp className="text-sm" />
    </button>
  );
}

export default BackToTopButton;
