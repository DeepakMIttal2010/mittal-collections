import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPageBySlug } from "../services/pageService";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

function PolicyPage() {
  const { slug } = useParams();
  const { t, language } = useLanguage();

  const [page, setPage] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      const data = await getPageBySlug(slug);

      if (cancelled) return;

      if (data.success) {
        setPage(data.page);
        setStatus("ready");
      } else {
        setStatus("not-found");
      }
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {t("Page not found", "पेज नहीं मिला")}
        </h1>
      </div>
    );
  }

  const showHindi = language === "hi" && page.titleHi && page.contentHi;
  const displayTitle = showHindi ? page.titleHi : page.title;
  const displayContent = showHindi ? page.contentHi : page.content;

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <Seo
        title={page.title}
        description={page.content.slice(0, 160)}
        url={`https://www.mittalcollections.com/policies/${slug}`}
      />

      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        {displayTitle}
      </h1>

      <div className="space-y-4 text-slate-600 leading-relaxed">
        {displayContent.split("\n\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

export default PolicyPage;
