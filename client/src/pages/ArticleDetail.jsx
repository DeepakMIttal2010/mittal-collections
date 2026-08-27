import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";

import { getArticleBySlug } from "../services/articleService";
import { imgUrl } from "../services/api";
import Seo from "../components/Seo";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { useLanguage } from "../context/LanguageContext";

const SITE_URL = "https://www.mittalcollections.com";

function ArticleDetail() {
  const { slug } = useParams();
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  // The URL prefix is what actually decides which content renders — a
  // /hi/ URL is a distinct, search-indexable page (see render.js and
  // sitemap.js), so canonical/hreflang stay correct regardless of the
  // visitor's own toggle. The effect below keeps this in sync with the
  // header's language toggle so switching it while already reading an
  // article still feels instant, the same as it does everywhere else on
  // the site, instead of only taking effect on the next navigation.
  const isHindi = location.pathname.startsWith("/hi/");

  const [article, setArticle] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      const response = await getArticleBySlug(slug);

      if (cancelled) return;

      if (response.success) {
        setArticle(response.article);
        setStatus("ready");
      } else {
        setStatus("not-found");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!article) return;
    const wantHindi = language === "hi";
    if (wantHindi === isHindi) return;
    // Only follow the toggle into /hi/ if this article actually has a
    // Hindi version — otherwise stay put rather than bounce to a page
    // that would immediately redirect itself back anyway.
    if (wantHindi && !article.titleHi) return;
    navigate(`${wantHindi ? "/hi" : ""}/articles/${article.slug}`, {
      replace: true,
    });
  }, [language, isHindi, article, navigate]);

  if (status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-slate-500">
        Loading...
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {isHindi ? "लेख नहीं मिला" : "Article not found"}
        </h1>
        <Link
          to={isHindi ? "/hi/articles" : "/articles"}
          className="text-blue-600 hover:underline"
        >
          {isHindi ? "गाइड और आइडिया पर वापस जाएं" : "Back to Guides & Ideas"}
        </Link>
      </div>
    );
  }

  const hasHindiContent = Boolean(article.titleHi);

  // No Hindi version authored yet for this article — send a /hi/ visitor
  // to the real (English) page rather than showing English content
  // under a Hindi URL, which would just be duplicate content under two
  // URLs with nothing distinguishing them.
  if (isHindi && !hasHindiContent) {
    return <Navigate to={`/articles/${article.slug}`} replace />;
  }

  const displayTitle = isHindi ? article.titleHi : article.title;
  const displayExcerpt = isHindi ? article.excerptHi || article.excerpt : article.excerpt;
  const displayContent = isHindi ? article.contentHi || article.content : article.content;

  const enUrl = `${SITE_URL}/articles/${article.slug}`;
  const hiUrl = `${SITE_URL}/hi/articles/${article.slug}`;
  const url = isHindi ? hiUrl : enUrl;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: displayTitle,
    description: displayExcerpt,
    image: article.coverImage ? imgUrl(article.coverImage) : undefined,
    datePublished: article.createdAt,
    dateModified: article.updatedAt,
    inLanguage: isHindi ? "hi" : "en",
    author: { "@type": "Organization", name: "Mittal Collections" },
    publisher: { "@type": "Organization", name: "Mittal Collections" },
  };

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: isHindi ? "गाइड और आइडिया" : "Guides & Ideas", path: isHindi ? "/hi/articles" : "/articles" },
    { name: displayTitle },
  ];

  // Only advertised as a real alternate once a Hindi version actually
  // exists — hasHindiContent is guaranteed true here for the Hindi
  // branch (the redirect above already handled the false case), so this
  // always includes both when reached.
  const alternateLangs = hasHindiContent
    ? [
        { lang: "en", url: enUrl },
        { lang: "hi", url: hiUrl },
        { lang: "x-default", url: enUrl },
      ]
    : undefined;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Seo
        title={displayTitle}
        description={displayExcerpt || displayTitle}
        image={article.coverImage ? imgUrl(article.coverImage) : undefined}
        url={url}
        lang={isHindi ? "hi" : "en"}
        alternateLangs={alternateLangs}
        jsonLd={[articleJsonLd, buildBreadcrumbJsonLd(breadcrumbItems)]}
      />

      <Breadcrumbs items={breadcrumbItems} />

      {hasHindiContent && (
        <Link
          to={isHindi ? `/articles/${article.slug}` : `/hi/articles/${article.slug}`}
          className="inline-block text-sm text-amber-600 hover:underline mb-4"
        >
          {isHindi ? "Read in English" : "हिंदी में पढ़ें"}
        </Link>
      )}

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        {displayTitle}
      </h1>

      {article.coverImage && (
        <img
          src={imgUrl(article.coverImage)}
          alt={displayTitle}
          className="w-full rounded-xl mb-8 object-cover max-h-96"
        />
      )}

      <div
        className="text-slate-700 leading-relaxed
          [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-3
          [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-6 [&_h3]:mb-2
          [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
          [&_li]:mb-1
          [&_a]:text-amber-600 [&_a]:underline
          [&_img]:rounded-lg [&_img]:my-4
          [&_table]:w-full [&_table]:my-6 [&_table]:border-collapse [&_table]:text-sm
          [&_th]:text-left [&_th]:bg-slate-50 [&_th]:font-semibold [&_th]:text-slate-700 [&_th]:px-3 [&_th]:py-2 [&_th]:border [&_th]:border-slate-200
          [&_td]:px-3 [&_td]:py-2 [&_td]:border [&_td]:border-slate-200"
        dangerouslySetInnerHTML={{ __html: displayContent }}
      />
    </div>
  );
}

export default ArticleDetail;
