import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaRulerCombined, FaArrowRight } from "react-icons/fa";

import { getArticles } from "../services/articleService";
import { imgUrl } from "../services/api";
import Seo from "../components/Seo";

function Articles() {
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Seo
        title="Guides & Ideas"
        description="Home furnishing guides, buying tips and styling ideas from Mittal Collections — bedsheets, curtains, towels and more."
        url="https://www.mittalcollections.com/articles"
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        Guides & Ideas
      </h1>
      <p className="text-slate-500 mb-8">
        Buying guides and styling tips to help you choose the right home
        furnishing.
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
            <p className="font-semibold">Curtain Size Calculator</p>
            <p className="text-sm text-blue-100">
              Enter your window size, get the exact curtain size to buy —
              free tool.
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
      ) : articles.length === 0 ? (
        <p className="text-slate-500">No articles yet — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <Link
              key={article._id}
              to={`/articles/${article.slug}`}
              className="group block"
            >
              <div className="aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden mb-3">
                {article.coverImage && (
                  <img
                    src={imgUrl(article.coverImage)}
                    alt={article.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
              </div>
              <h2 className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors">
                {article.title}
              </h2>
              {article.excerpt && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {article.excerpt}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Articles;
