import { Link } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { useLanguage } from "../context/LanguageContext";

// items: [{ name, path }] — path omitted on the last (current) item.
function Breadcrumbs({ items }) {
  const { t } = useLanguage();

  return (
    <nav aria-label={t("Breadcrumb", "ब्रेडक्रंब")} className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;

          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <FaChevronRight className="text-[10px] text-slate-300" />
              )}
              {item.path && !isLast ? (
                <Link to={item.path} className="hover:text-amber-600 hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-slate-700 font-medium" : ""}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
