import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <Seo
        title="Page Not Found"
        description="The page you're looking for doesn't exist."
        noindex
      />

      <p className="text-sm font-semibold text-amber-600 mb-3">404</p>

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        {t("Page Not Found", "पेज नहीं मिला")}
      </h1>

      <p className="text-slate-600 mb-8">
        {t(
          "The page you're looking for doesn't exist or may have been moved.",
          "आप जिस पेज को खोज रहे हैं वह मौजूद नहीं है या स्थानांतरित हो गया है।",
        )}
      </p>

      <Link
        to="/"
        className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors"
      >
        {t("Back to Home", "होम पर वापस जाएं")}
      </Link>
    </div>
  );
}

export default NotFound;
