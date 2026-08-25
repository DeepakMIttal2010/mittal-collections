import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCategories } from "../services/categoryService";
import { getSubcategories } from "../services/subcategoryService";
import {
  getProductsByCategory,
  getProductsBySubcategory,
} from "../services/productService";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { getSiteSettings } from "../services/settingsService";
import { FaRulerCombined, FaGift } from "react-icons/fa";

// Sizing/buying help callouts shown on the matching category's product
// listing — curtains gets the interactive calculator (real measurement
// math is involved there); the others just need a reference guide, since
// customers repeatedly ask "which size/type do I actually need" for all
// of these (bed size, room/entrance, use-case, fill firmness). A category
// can list more than one guide (e.g. doormats: size AND buying-guide) —
// each entry also doubles as an internal link that helps these articles
// get discovered/indexed, since they otherwise only sit on /articles.
const SIZE_HELP_LINKS = {
  curtains: [
    {
      to: "/curtain-size-calculator",
      label: "Not sure what size to buy?",
      cta: "Use our free Curtain Size Calculator →",
    },
  ],
  bedsheets: [
    {
      to: "/articles/bedsheet-size-guide-which-size-fits-single-double-queen-king-beds",
      label: "Confused about bed sizes?",
      cta: "See our Bedsheet Size Guide (Single/Double/Queen/King) →",
    },
  ],
  doormats: [
    {
      to: "/articles/doormat-size-guide-which-size-for-entrance-bedroom-bathroom-kitchen",
      label: "Not sure which size fits where?",
      cta: "See our Doormat Size Guide →",
    },
    {
      to: "/articles/how-to-choose-the-right-doormat",
      label: "Not sure which doormat to pick?",
      cta: "See our Doormat Buying Guide →",
    },
  ],
  towels: [
    {
      to: "/articles/towel-size-guide-which-size-for-face-hand-bath-cleaning",
      label: "Face, hand or bath towel?",
      cta: "See our Towel Size Guide →",
    },
  ],
  "cushion-covers": [
    {
      to: "/articles/cushion-cover-size-guide-standard-sizes-what-we-stock",
      label: "Not sure which cushion cover size fits?",
      cta: "See our Cushion Cover Size Guide →",
    },
  ],
  cushions: [
    {
      to: "/articles/pillows-vs-cushions-fill-and-firmness-guide",
      label: "Not sure what filling to pick?",
      cta: "See our Pillows vs Cushions Fill & Firmness Guide →",
    },
  ],
};

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "name-asc", label: "Alphabetically, A-Z" },
  { value: "name-desc", label: "Alphabetically, Z-A" },
  { value: "date-desc", label: "Date, new to old" },
  { value: "date-asc", label: "Date, old to new" },
];

function sortProducts(products, sortBy) {
  const sorted = [...products];

  switch (sortBy) {
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "date-asc":
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case "date-desc":
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case "featured":
    default:
      sorted.sort((a, b) => (b.featured === true) - (a.featured === true));
  }

  // Stable final pass, same as the backend's default listing order — an
  // out-of-stock-but-restockable product still shows (for its "Notify Me"
  // alert) but always sinks below every in-stock product, regardless of
  // which sort mode is selected above (price, name, featured, etc.).
  sorted.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));

  return sorted;
}

function CategoryPage() {
  const { categorySlug, subcategorySlug } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState(null);
  const [subcategoryList, setSubcategoryList] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [sortBy, setSortBy] = useState("featured");
  const [bundlePartners, setBundlePartners] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [catRes, settingsRes] = await Promise.all([
        getCategories(),
        getSiteSettings(),
      ]);
      const matchedCategory = catRes.categories.find(
        (c) => c.slug === categorySlug,
      );

      if (!matchedCategory) {
        if (!cancelled) setStatus("not-found");
        return;
      }

      const subRes = await getSubcategories();
      const categorySubcategories = subRes.subcategories
        .filter((s) => s.category?._id === matchedCategory._id)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      const matchedSubcategory = subcategorySlug
        ? categorySubcategories.find((s) => s.slug === subcategorySlug)
        : null;

      const productsRes = matchedSubcategory
        ? await getProductsBySubcategory(matchedSubcategory._id)
        : await getProductsByCategory(matchedCategory._id);

      // Same bundle-discount rules the product-detail page's "Complete
      // the Look" banner uses (see ProductDetails.jsx) — surfaced here
      // too so the discount is visible while browsing, not just after
      // opening a specific product. A category can appear in more than
      // one active rule (e.g. Cushion Covers pairs with Bedsheets,
      // Doormats AND Cushions) — show all of them, not just the first.
      const matchedRules = (settingsRes.settings?.bundleRules || [])
        .filter(
          (rule) =>
            rule.isActive &&
            (rule.categoryA?._id === matchedCategory._id ||
              rule.categoryB?._id === matchedCategory._id),
        )
        .map((rule) => ({
          partner:
            rule.categoryA?._id === matchedCategory._id
              ? rule.categoryB
              : rule.categoryA,
          discountPercent: rule.discountPercent,
        }));

      if (cancelled) return;
      setCategory(matchedCategory);
      setSubcategoryList(categorySubcategories);
      setActiveSubcategory(matchedSubcategory);
      setProducts(productsRes.products);
      setBundlePartners(matchedRules);
      setStatus("ready");
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [categorySlug, subcategorySlug]);

  const sortedProducts = useMemo(
    () => sortProducts(products, sortBy),
    [products, sortBy],
  );

  if (status === "loading") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <ProductGridSkeleton />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Seo title="Category Not Found" noindex />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Category not found
        </h2>
        <Link to="/" className="text-blue-700 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const pillClass = (isActive) =>
    `px-4 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors ${
      isActive
        ? "bg-amber-600 border-amber-600 text-white"
        : "border-slate-300 text-slate-700 hover:border-amber-600 hover:text-amber-600"
    }`;

  // "Double Bed Size" under Bedsheets is 100% cotton products, but the
  // subcategory's own display name (used for the nav pill) doesn't say
  // so — that exact phrase has real, currently-unranked Search Console
  // demand, so the <title>/meta description (not the visible pill) get
  // it woven in here instead of renaming the subcategory itself.
  const isCottonDoubleBedsheets =
    categorySlug === "bedsheets" && activeSubcategory?.slug === "double-bed-size";

  const pageTitle = isCottonDoubleBedsheets
    ? "Cotton Double Bedsheets"
    : activeSubcategory
      ? `${activeSubcategory.name} - ${category.name}`
      : category.name;

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: category.name, path: `/category/${categorySlug}` },
    ...(activeSubcategory ? [{ name: activeSubcategory.name }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Seo
        title={pageTitle}
        description={`Buy ${pageTitle} online with pan-India delivery at Mittal Collections - fast 24-hour delivery in Ghaziabad. ${category.description || ""}`.trim()}
        url={`https://www.mittalcollections.com/category/${categorySlug}${subcategorySlug ? `/${subcategorySlug}` : ""}`}
        jsonLd={buildBreadcrumbJsonLd(breadcrumbItems)}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className="text-xl font-semibold text-slate-800 mb-4">
        {category.name}
        {activeSubcategory ? ` / ${activeSubcategory.name}` : ""}
      </h1>

      {bundlePartners.map(({ partner, discountPercent }) => (
        <Link
          key={partner.slug}
          to={`/category/${partner.slug}`}
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 hover:border-amber-400 transition-colors"
        >
          <span className="w-9 h-9 shrink-0 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm">
            <FaGift />
          </span>
          <span className="text-sm">
            <span className="font-semibold text-amber-800">
              Buy {category.name} + {partner.name} together
            </span>{" "}
            <span className="text-amber-700">
              and get {discountPercent}% off automatically at checkout →
            </span>
          </span>
        </Link>
      ))}

      {(SIZE_HELP_LINKS[categorySlug] || []).map((guide) => (
        <Link
          key={guide.to}
          to={guide.to}
          className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 hover:border-blue-400 transition-colors"
        >
          <span className="w-9 h-9 shrink-0 rounded-full bg-blue-900 text-white flex items-center justify-center text-sm">
            <FaRulerCombined />
          </span>
          <span className="text-sm">
            <span className="font-semibold text-blue-900">
              {guide.label}
            </span>{" "}
            <span className="text-blue-700">{guide.cta}</span>
          </span>
        </Link>
      ))}

      {subcategoryList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            type="button"
            className={pillClass(!activeSubcategory)}
            onClick={() => navigate(`/category/${categorySlug}`)}
          >
            All
          </button>

          {subcategoryList.map((sub) => (
            <button
              key={sub._id}
              type="button"
              className={pillClass(activeSubcategory?._id === sub._id)}
              onClick={() =>
                navigate(`/category/${categorySlug}/${sub.slug}`)
              }
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mb-6">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-slate-300 rounded-lg text-sm text-slate-700 px-3 py-2 outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort by: {opt.label}
            </option>
          ))}
        </select>
      </div>

      <ProductGrid products={sortedProducts} />
    </div>
  );
}

export default CategoryPage;
