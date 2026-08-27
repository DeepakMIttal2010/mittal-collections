import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaRulerCombined, FaArrowRight } from "react-icons/fa";

import { getArticles } from "../services/articleService";
import { imgUrl } from "../services/api";
import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

const SITE_URL = "https://www.mittalcollections.com";

function Articles() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const isHindi = location.pathname.startsWith("/hi/");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await getArticles();

      if (response.success) setArticles(response.articles);

      setLoading(false);
    };

    load();
  }, []);

  // The URL prefix is what actually decides which content renders (see
  // the isHindi above) — that's what keeps this page's canonical URL and
  // hreflang tags SEO-correct regardless of the visitor's own language
  // preference. This effect just keeps the URL itself in sync with the
  // header's language toggle, so switching it while already on this page
  // feels the same as it does everywhere else on the site (Product
  // name/description swap in place) instead of requiring a fresh click.
  useEffect(() => {
    const wantHindi = language === "hi";
    if (wantHindi === isHindi) return;
    navigate(wantHindi ? "/hi/articles" : "/articles", { replace: true });
  }, [language, isHindi, navigate]);

  // The Hindi listing only shows articles that actually have a Hindi
  // version — otherwise it would link to a /hi/articles/:slug URL that
  // just redirects straight back to English (see ArticleDetail.jsx).
  const visibleArticles = isHindi
    ? articles.filter((article) => article.titleHi)
    : articles;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Seo
        title={isHindi ? "गाइड और आइडिया" : "Guides & Ideas"}
        description={
          isHindi
            ? "मित्तल कलेक्शंस से घर की साज-सज्जा की गाइड, खरीदारी के सुझाव और सजावट के आइडिया — चादर, पर्दे, तौलिए और भी बहुत कुछ।"
            : "Home furnishing guides, buying tips and styling ideas from Mittal Collections — bedsheets, curtains, towels and more."
        }
        url={`${SITE_URL}${isHindi ? "/hi/articles" : "/articles"}`}
        lang={isHindi ? "hi" : "en"}
        alternateLangs={[
          { lang: "en", url: `${SITE_URL}/articles` },
          { lang: "hi", url: `${SITE_URL}/hi/articles` },
          { lang: "x-default", url: `${SITE_URL}/articles` },
        ]}
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        {isHindi ? "गाइड और आइडिया" : "Guides & Ideas"}
      </h1>
      <p className="text-slate-500 mb-8">
        {isHindi
          ? "सही घरेलू साज-सज्जा चुनने में मदद करने वाली खरीदारी गाइड और स्टाइलिंग टिप्स।"
          : "Buying guides and styling tips to help you choose the right home furnishing."}
      </p>

      <Link
        to="/curtain-size-calculator"
        className="group flex items-center justify-between gap-4 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl p-6 mb-10"
      >
        <div className="flex items-center gap-4">
          <span className="w-11 h-11 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-lg">
            <FaRulerCombined />
          </span>
          <div>
            <p className="font-semibold">
              {isHindi ? "कर्टन साइज़ कैलकुलेटर" : "Curtain Size Calculator"}
            </p>
            <p className="text-sm text-blue-100">
              {isHindi
                ? "अपनी विंडो का साइज़ डालें, खरीदने के लिए सही कर्टन साइज़ पाएं — मुफ़्त टूल।"
                : "Enter your window size, get the exact curtain size to buy — free tool."}
            </p>
          </div>
        </div>
        <FaArrowRight className="shrink-0 group-hover:translate-x-1 transition-transform" />
      </Link>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-44 bg-slate-200 rounded-lg mb-3" />
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : visibleArticles.length === 0 ? (
        <p className="text-slate-500">
          {isHindi
            ? "अभी तक कोई हिंदी लेख नहीं — जल्द ही वापस देखें।"
            : "No articles yet — check back soon."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleArticles.map((article) => {
            const displayTitle = isHindi ? article.titleHi : article.title;
            const displayExcerpt = isHindi
              ? article.excerptHi || article.excerpt
              : article.excerpt;

            return (
              <Link
                key={article._id}
                to={`${isHindi ? "/hi" : ""}/articles/${article.slug}`}
                className="group block"
              >
                <div className="aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden mb-3">
                  {article.coverImage && (
                    <img
                      src={imgUrl(article.coverImage)}
                      alt={displayTitle}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                <h2 className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors">
                  {displayTitle}
                </h2>
                {displayExcerpt && (
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                    {displayExcerpt}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Articles;
