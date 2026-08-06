import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getArticleBySlug } from "../services/articleService";
import { imgUrl } from "../services/api";
import Seo from "../components/Seo";

function ArticleDetail() {
  const { slug } = useParams();

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
          Article not found
        </h1>
        <Link to="/articles" className="text-blue-600 hover:underline">
          Back to Guides & Ideas
        </Link>
      </div>
    );
  }

  const url = `https://www.mittalcollections.com/articles/${article.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    image: article.coverImage ? imgUrl(article.coverImage) : undefined,
    datePublished: article.createdAt,
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: "Mittal Collections" },
    publisher: { "@type": "Organization", name: "Mittal Collections" },
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Seo
        title={article.title}
        description={article.excerpt || article.title}
        image={article.coverImage ? imgUrl(article.coverImage) : undefined}
        url={url}
        jsonLd={articleJsonLd}
      />

      <Link
        to="/articles"
        className="text-sm text-blue-600 hover:underline mb-6 inline-block"
      >
        ← Guides & Ideas
      </Link>

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        {article.title}
      </h1>

      {article.coverImage && (
        <img
          src={imgUrl(article.coverImage)}
          alt={article.title}
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
          [&_img]:rounded-lg [&_img]:my-4"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </div>
  );
}

export default ArticleDetail;
