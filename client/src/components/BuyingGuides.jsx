import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { imgUrl } from "../services/api";
import { getArticlesByCategory } from "../services/articleService";
import { rankGuidesForProduct } from "../utils/rankGuides";

// Up to 3 guides from the product's own category (size, fabric and care
// guides) under the product page -- the one place a shopper deciding on
// a size or fabric actually is, and an internal link from every product
// to its category's guides for crawlers. Renders nothing until guides
// load, and nothing at all for a category without any.
function BuyingGuides({ product, isHindi }) {
  const [guides, setGuides] = useState([]);
  const categoryId = product?.category?._id;
  const productName = product?.name;

  useEffect(() => {
    let cancelled = false;
    setGuides([]);
    if (!categoryId) return undefined;

    getArticlesByCategory(categoryId).then((res) => {
      if (!cancelled && res.success) setGuides(rankGuidesForProduct(res.articles, productName, categoryId));
    });

    return () => {
      cancelled = true;
    };
  }, [categoryId, productName]);

  if (guides.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="text-3xl font-bold text-slate-900 mb-6">
        {isHindi ? "खरीदने से पहले पढ़ें" : "Buying guides"}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {guides.map((article) => {
          // A guide without a Hindi version links to its English page
          // (the /hi/ URL would only redirect there).
          const hindi = isHindi && Boolean(article.titleHi);
          const title = hindi ? article.titleHi : article.title;
          const excerpt = hindi ? article.excerptHi || article.excerpt : article.excerpt;

          return (
            <Link key={article._id} to={`${hindi ? "/hi" : ""}/articles/${article.slug}`} className="group flex gap-4 items-start">
              <div className="w-24 h-24 shrink-0 bg-slate-100 rounded-lg overflow-hidden">
                {article.coverImage && (
                  <img
                    src={imgUrl(article.coverImage, "w_200,q_auto,f_auto")}
                    alt=""
                    width="96"
                    height="96"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-2">
                  {title}
                </h3>
                {excerpt && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{excerpt}</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default BuyingGuides;
