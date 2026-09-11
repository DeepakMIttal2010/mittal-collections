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
import { useLanguage } from "../context/LanguageContext";
import { FaGift, FaFilter, FaTimes } from "react-icons/fa";

// Sizing/buying help callouts shown on the matching category's product
// listing — curtains gets the interactive calculator (real measurement
// math is involved there); the others just need a reference guide, since
// customers repeatedly ask "which size/type do I actually need" for all
// of these (bed size, room/entrance, use-case, fill firmness). A category
// can list more than one guide (e.g. doormats: size AND buying-guide) —
// each entry also doubles as an internal link that helps these articles
// get discovered/indexed, since they otherwise only sit on /articles.
// shortLabel is the compact link text used in the single combined guide
// line below the category header (see CategoryPage's render) — the
// longer label/cta pair was the full sentence each of these used to get
// its own full-width card for, which pushed the product grid too far
// down a page whose entire job is to show products fast.
function getSizeHelpLinks(t) {
  return {
    curtains: [
      {
        to: "/curtain-size-calculator",
        shortLabel: t("Size Calculator", "साइज़ कैलकुलेटर"),
      },
    ],
    bedsheets: [
      {
        to: "/articles/bedsheet-size-guide-which-size-fits-single-double-queen-king-beds",
        shortLabel: t("Size Guide", "साइज़ गाइड"),
      },
    ],
    doormats: [
      {
        to: "/articles/doormat-size-guide-which-size-for-entrance-bedroom-bathroom-kitchen",
        shortLabel: t("Size Guide", "साइज़ गाइड"),
      },
      {
        to: "/articles/how-to-choose-the-right-doormat",
        shortLabel: t("Buying Guide", "खरीद गाइड"),
      },
    ],
    towels: [
      {
        to: "/articles/towel-size-guide-which-size-for-face-hand-bath-cleaning",
        shortLabel: t("Size Guide", "साइज़ गाइड"),
      },
    ],
    "cushion-covers": [
      {
        to: "/articles/cushion-cover-size-guide-standard-sizes-what-we-stock",
        shortLabel: t("Size Guide", "साइज़ गाइड"),
      },
    ],
    cushions: [
      {
        to: "/articles/pillows-vs-cushions-fill-and-firmness-guide",
        shortLabel: t("Fill Guide", "फिल गाइड"),
      },
    ],
  };
}

// The raw groupLabel values ("By Type", "By Material", ...) come straight
// from the admin-managed Subcategory records — friendlier for a section
// heading than showing "By Material" verbatim.
function friendlyGroupLabel(groupLabel) {
  if (groupLabel === "By Type") return "Type";
  if (groupLabel === "By Material") return "Material";
  if (groupLabel === "Size") return "Popular Dimensions";
  if (groupLabel === "Bed Size") return "Bed Type";

  return groupLabel;
}

function friendlyGroupLabelHi(groupLabel) {
  if (groupLabel === "By Type") return "प्रकार";
  if (groupLabel === "By Material") return "मटीरियल";
  if (groupLabel === "Size") return "लोकप्रिय आयाम";
  if (groupLabel === "Bed Size") return "बेड टाइप";

  return groupLabel;
}

// Which subcategory group gets the always-visible top pill row (clicking
// a pill *replaces* the URL's subcategory — see the pill onClick below)
// versus a checkbox facet in the Filter panel (which ANDs on top of
// whatever subcategory is already active, via selectedFacetIds). Used to
// matter less when every subcategory defaulted to the same displayOrder
// (0) and ties broke on whatever order the API happened to return them
// in — on Bedsheets that silently put "By Material" first instead of
// "By Type" once Cotton Bedsheets (created earlier) sorted ahead of
// Fitted Bedsheet (created later), so clicking "Cotton Bedsheets" while
// already on /bedsheets/fitted-bedsheet replaced the URL and showed
// every cotton bedsheet instead of narrowing the fitted ones. Type (the
// broadest, most natural first choice while browsing) is always meant to
// win when present; Material is deliberately last since it's the most
// useful as a same-page facet, not its own landing page.
const PRIMARY_GROUP_PRIORITY = ["By Type", "Bed Size", "Size", "By Material"];

function pickPrimaryGroupLabel(groupLabels) {
  for (const label of PRIMARY_GROUP_PRIORITY) {
    if (groupLabels.includes(label)) return label;
  }
  return groupLabels[0];
}

// min/max in rupees; max: null means "no upper bound" (the "1,500+" row).
function getPriceRanges(t) {
  return [
    { id: "under-499", label: t("Under ₹499", "₹499 से कम"), min: 0, max: 499 },
    { id: "500-999", label: "₹500 – ₹999", min: 500, max: 999 },
    { id: "1000-1499", label: "₹1,000 – ₹1,499", min: 1000, max: 1499 },
    { id: "1500-plus", label: t("₹1,500 and above", "₹1,500 और ऊपर"), min: 1500, max: null },
  ];
}

function getSortOptions(t) {
  return [
    { value: "featured", label: t("Featured", "फ़ीचर्ड") },
    { value: "price-asc", label: t("Price, low to high", "कीमत, कम से ज़्यादा") },
    { value: "price-desc", label: t("Price, high to low", "कीमत, ज़्यादा से कम") },
    { value: "name-asc", label: t("Alphabetically, A-Z", "वर्णानुक्रम, A-Z") },
    { value: "name-desc", label: t("Alphabetically, Z-A", "वर्णानुक्रम, Z-A") },
    { value: "date-desc", label: t("Date, new to old", "तारीख़, नए से पुराने") },
    { value: "date-asc", label: t("Date, old to new", "तारीख़, पुराने से नए") },
  ];
}

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
  const { t } = useLanguage();

  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState(null);
  const [subcategoryList, setSubcategoryList] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [sortBy, setSortBy] = useState("featured");
  const [bundlePartners, setBundlePartners] = useState([]);
  // priceRangeId is the selected row's `id` (see getPriceRanges), or null
  // for "no price filter applied". isFilterOpen controls the bottom-sheet
  // panel visibility — separate from the selection itself so opening the
  // panel doesn't immediately re-filter anything until Apply is pressed.
  const [priceRangeId, setPriceRangeId] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // A draft copy, only committed to priceRangeId on "Apply Filters" — so
  // opening the panel, changing your mind, and tapping outside to close
  // it doesn't silently apply a filter you never confirmed.
  const [draftPriceRangeId, setDraftPriceRangeId] = useState(null);
  // Material/Size (and any other non-primary subcategory group) as
  // checkbox facets in the filter panel — a Set of subcategory _ids,
  // OR'd within a group ("Cotton" or "Microfiber"), AND'd across groups
  // (must match a selected Material AND a selected Size if both are set).
  // Separate from the primary group's pills above, which keep their
  // existing single-select navigate-to-a-URL behaviour unchanged.
  const [selectedFacetIds, setSelectedFacetIds] = useState(new Set());
  const [draftFacetIds, setDraftFacetIds] = useState(new Set());
  const [minRating, setMinRating] = useState(null);
  const [draftMinRating, setDraftMinRating] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [catRes, settingsRes] = await Promise.all([
        getCategories(),
        getSiteSettings(),
      ]);

      // getCategories() swallows any fetch failure into an empty list
      // (see categoryService.js) — treating that the same as "this slug
      // doesn't exist" would noindex the page on a transient backend
      // hiccup instead of a genuine 404, the same bug already found and
      // fixed on ProductDetails.jsx (Search Console's "Excluded by
      // noindex tag" report, 2026-09-01).
      if (!catRes.success) {
        if (!cancelled) setStatus("error");
        return;
      }

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

      // A pill click on a Material/Size/etc. subcategory (anything but
      // the primary group) is really applying that one facet — the
      // Filter panel should show it pre-checked instead of looking like
      // no filter is active while the customer is standing on that
      // exact page (reported after seeing an unchecked "15 x 22 Inches"
      // box while already on /doormats/15-x-22-inches).
      const primaryGroupLabel = pickPrimaryGroupLabel(
        categorySubcategories.map((s) => s.groupLabel),
      );
      const isFacetSubcategory =
        matchedSubcategory && matchedSubcategory.groupLabel !== primaryGroupLabel;

      if (cancelled) return;
      setCategory(matchedCategory);
      setSubcategoryList(categorySubcategories);
      setActiveSubcategory(matchedSubcategory);
      setSelectedFacetIds(
        isFacetSubcategory ? new Set([matchedSubcategory._id]) : new Set(),
      );
      setProducts(productsRes.products);
      setBundlePartners(matchedRules);
      setStatus("ready");
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [categorySlug, subcategorySlug]);

  const priceRanges = useMemo(() => getPriceRanges(t), [t]);
  const activePriceRange = priceRanges.find((r) => r.id === priceRangeId) || null;

  // Grouped by groupLabel, in whatever order they first appear — which
  // group is "primary" (see pickPrimaryGroupLabel above) decides pill vs.
  // checkbox-facet behaviour below, not this array's own order.
  const subcategoryGroups = useMemo(() => {
    const groups = [];
    for (const sub of subcategoryList) {
      let group = groups.find((g) => g.label === sub.groupLabel);
      if (!group) {
        group = { label: sub.groupLabel, items: [] };
        groups.push(group);
      }
      group.items.push(sub);
    }
    return groups;
  }, [subcategoryList]);

  const primaryGroupLabel = pickPrimaryGroupLabel(
    subcategoryGroups.map((g) => g.label),
  );
  const primaryGroup =
    subcategoryGroups.find((g) => g.label === primaryGroupLabel) || null;
  const facetGroups = subcategoryGroups.filter((g) => g !== primaryGroup);
  const activeSubcategoryIsFacet = facetGroups.some((group) =>
    group.items.some((item) => item._id === activeSubcategory?._id),
  );

  const matchesFacets = (product) => {
    if (selectedFacetIds.size === 0) return true;

    const productSubIds = new Set(
      (product.subcategories || []).map((s) => s._id || s),
    );

    return facetGroups.every((group) => {
      const selectedInGroup = group.items.filter((item) =>
        selectedFacetIds.has(item._id),
      );
      // No box checked in this group -> this group imposes no constraint.
      if (selectedInGroup.length === 0) return true;

      return selectedInGroup.some((item) => productSubIds.has(item._id));
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (activePriceRange) {
        if (
          p.price < activePriceRange.min ||
          (activePriceRange.max !== null && p.price > activePriceRange.max)
        ) {
          return false;
        }
      }

      if (minRating !== null && (p.rating || 0) < minRating) return false;

      return matchesFacets(p);
    });
    // matchesFacets closes over facetGroups/selectedFacetIds, both listed
    // below, so it doesn't need to be a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, activePriceRange, minRating, selectedFacetIds, facetGroups]);

  const sortedProducts = useMemo(
    () => sortProducts(filteredProducts, sortBy),
    [filteredProducts, sortBy],
  );

  const activeFilterCount =
    (activePriceRange ? 1 : 0) + (minRating !== null ? 1 : 0) + selectedFacetIds.size;

  const openFilterPanel = () => {
    setDraftPriceRangeId(priceRangeId);
    setDraftFacetIds(new Set(selectedFacetIds));
    setDraftMinRating(minRating);
    setIsFilterOpen(true);
  };

  // The active-subcategory pill (e.g. "15 x 22 Inches") is also the URL —
  // products were already fetched scoped to it server-side, so unchecking
  // it in the panel can't just update local state (nothing would actually
  // broaden the results). It has to navigate back to the plain category
  // URL instead, same as clicking "All".
  const applyFilters = () => {
    if (activeSubcategoryIsFacet && !draftFacetIds.has(activeSubcategory._id)) {
      navigate(`/category/${categorySlug}`);
      setIsFilterOpen(false);
      return;
    }

    setPriceRangeId(draftPriceRangeId);
    setSelectedFacetIds(new Set(draftFacetIds));
    setMinRating(draftMinRating);
    setIsFilterOpen(false);
  };

  const clearAllFilters = () => {
    setDraftPriceRangeId(null);
    setPriceRangeId(null);
    setDraftFacetIds(new Set());
    setSelectedFacetIds(new Set());
    setDraftMinRating(null);
    setMinRating(null);
    setIsFilterOpen(false);

    if (activeSubcategoryIsFacet) {
      navigate(`/category/${categorySlug}`);
    }
  };

  const toggleDraftFacet = (id) => {
    setDraftFacetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  const removeFacet = (id) => {
    if (activeSubcategoryIsFacet && id === activeSubcategory._id) {
      navigate(`/category/${categorySlug}`);
      return;
    }

    setSelectedFacetIds((prev) => {
      const next = new Set(prev);
      next.delete(id);

      return next;
    });
  };

  // EXPERIMENTAL (desktop sidebar preview, not yet shipped) — the sidebar
  // applies instantly on click, Amazon-style, so it skips the draft/Apply
  // flow the mobile bottom-sheet uses (that flow exists so a tap-to-open
  // panel doesn't silently filter before you confirm; a persistent
  // always-visible sidebar has no such "did I mean to open this" moment).
  const toggleSidebarFacet = (id) => {
    if (activeSubcategoryIsFacet && id === activeSubcategory._id) {
      navigate(`/category/${categorySlug}`);
      return;
    }

    setSelectedFacetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  if (status === "loading") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <ProductGridSkeleton />
      </div>
    );
  }

  if (status === "error") {
    // A fetch failure, not a confirmed missing category — deliberately
    // no <Seo noindex> here (see the comment above where this status is
    // set). A real visitor gets a retry instead of a permanent dead end.
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          {t(
            "Something went wrong loading this page",
            "इस पेज को लोड करने में समस्या हुई",
          )}
        </h2>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-blue-700 hover:underline"
        >
          {t("Try again", "फिर से कोशिश करें")}
        </button>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Seo title="Category Not Found" noindex />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          {t("Category not found", "श्रेणी नहीं मिली")}
        </h2>
        <Link to="/" className="text-blue-700 hover:underline">
          {t("Back to home", "होम पर वापस जाएं")}
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

  // Structured data and the <Seo> title/meta stay English-only regardless
  // of the language toggle (schema.org/SEO convention) — only the visible
  // breadcrumb trail below gets translated.
  const breadcrumbItemsForSeo = [
    { name: "Home", path: "/" },
    { name: category.name, path: `/category/${categorySlug}` },
    ...(activeSubcategory ? [{ name: activeSubcategory.name }] : []),
  ];

  const breadcrumbItems = [
    { name: t("Home", "होम"), path: "/" },
    {
      name: t(category.name, category.nameHi),
      path: `/category/${categorySlug}`,
    },
    ...(activeSubcategory
      ? [{ name: t(activeSubcategory.name, activeSubcategory.nameHi) }]
      : []),
  ];

  const sizeHelpLinks = getSizeHelpLinks(t);
  const sortOptions = getSortOptions(t);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Seo
        title={pageTitle}
        description={`Buy ${pageTitle} online with pan-India delivery at Mittal Collections - fast 24-hour delivery in Ghaziabad. ${category.description || ""}`.trim()}
        url={`https://www.mittalcollections.com/category/${categorySlug}${subcategorySlug ? `/${subcategorySlug}` : ""}`}
        jsonLd={buildBreadcrumbJsonLd(breadcrumbItemsForSeo)}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className="text-xl font-semibold text-slate-800 mb-4">
        {t(category.name, category.nameHi)}
        {activeSubcategory
          ? ` / ${t(activeSubcategory.name, activeSubcategory.nameHi)}`
          : ""}
      </h1>

      {/* Was one full-width card per bundle partner and per guide link —
          on a category with 2 of each (e.g. Doormats: Bedsheets + Cushion
          Covers bundles, Size + Buying guides) that pushed the product
          grid nearly a full screen down on mobile, on a page whose whole
          job is to show products fast. Both are now a single slim line
          each, regardless of how many partners/guides exist. */}
      {bundlePartners.length > 0 && (
        <Link
          to={`/category/${bundlePartners[0].partner.slug}`}
          className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-sm hover:border-amber-400 transition-colors"
        >
          <FaGift className="text-amber-600 shrink-0" />
          <span className="text-amber-800">
            {t(
              `Buy ${category.name} + ${bundlePartners.map((b) => b.partner.name).join(" or ")} → Get Extra ${bundlePartners[0].discountPercent}% Off`,
              `${t(category.name, category.nameHi)} + ${bundlePartners.map((b) => t(b.partner.name, b.partner.nameHi)).join(" या ")} खरीदें → अतिरिक्त ${bundlePartners[0].discountPercent}% छूट पाएं`,
            )}
          </span>
        </Link>
      )}

      {(sizeHelpLinks[categorySlug] || []).length > 0 && (
        <p className="text-sm text-slate-600 mb-4">
          {t("Not sure what to buy?", "पक्का नहीं क्या खरीदें?")}{" "}
          {sizeHelpLinks[categorySlug].map((guide, i) => (
            <span key={guide.to}>
              {i > 0 && " | "}
              <Link to={guide.to} className="text-blue-700 hover:underline">
                {guide.shortLabel}
              </Link>
            </span>
          ))}
        </p>
      )}

      {/* Primary group (whichever comes first by displayOrder — usually
          "By Type" or, for a category like Doormats that has no type
          split, "By Material") stays visible at every width: it's the
          main way to narrow down which kind of product this is. Every
          other group (Material when it isn't primary, Size, Bed Size)
          becomes a checkbox facet in the Filter panel below instead —
          hidden here on mobile to keep the page product-first, still
          shown as their own labelled row on desktop where there's room. */}
      {primaryGroup && (
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            type="button"
            className={pillClass(!activeSubcategory)}
            onClick={() => navigate(`/category/${categorySlug}`)}
          >
            {t("All", "सभी")}
          </button>

          {primaryGroup.items.map((sub) => (
            <button
              key={sub._id}
              type="button"
              className={pillClass(activeSubcategory?._id === sub._id)}
              onClick={() =>
                navigate(`/category/${categorySlug}/${sub.slug}`)
              }
            >
              {t(sub.name, sub.nameHi)}
            </button>
          ))}
        </div>
      )}

      {facetGroups.map((group) => (
        <div key={group.label} className="hidden sm:block lg:hidden mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {t(friendlyGroupLabel(group.label), friendlyGroupLabelHi(group.label))}
          </p>
          <div className="flex flex-wrap gap-3">
            {group.items.map((sub) => (
              <button
                key={sub._id}
                type="button"
                className={pillClass(activeSubcategory?._id === sub._id)}
                onClick={() =>
                  navigate(`/category/${categorySlug}/${sub.slug}`)
                }
              >
                {t(sub.name, sub.nameHi)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="lg:flex lg:gap-8 lg:items-start">
        {/* EXPERIMENTAL — Amazon-style persistent desktop sidebar, preview
            only (not wired up for mobile/tablet, which keep the existing
            Filter-button + bottom-sheet below). Applies every change
            instantly instead of the sheet's draft+Apply flow — see
            toggleSidebarFacet's comment for why that's the right call for
            an always-visible panel. Reuses every bit of existing filter
            state/logic (priceRangeId, selectedFacetIds, minRating) — same
            source of truth as the mobile panel, so switching between
            screen widths never desyncs the two. */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-24 self-start">
          {/* pb-16 (not the usual p-4 all round) — on a category with few
              filter groups this card is short enough that, at the top of
              the page before the sticky offset kicks in, its last row can
              land right where the fixed WhatsApp button sits (bottom-left
              corner). Reserving extra space at the bottom keeps the two
              apart without touching WhatsAppButton itself, which floats
              on every page and can't know this one card's height. */}
          <div className="border border-slate-200 rounded-lg p-4 pb-16 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                {t("Filters", "फ़िल्टर")}
              </h2>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-blue-700 hover:underline"
                >
                  {t("Clear All", "सभी हटाएं")}
                </button>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {t("Price", "कीमत")}
              </h3>

              <div className="space-y-2.5">
                {priceRanges.map((range) => (
                  <label
                    key={range.id}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="sidebar-price-range"
                      checked={priceRangeId === range.id}
                      onChange={() =>
                        setPriceRangeId((prev) =>
                          prev === range.id ? null : range.id,
                        )
                      }
                      className="w-4 h-4 accent-amber-600"
                    />
                    <span className="text-sm text-slate-700">
                      {range.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {facetGroups.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  {t(friendlyGroupLabel(group.label), friendlyGroupLabelHi(group.label))}
                </h3>

                <div className="space-y-2.5">
                  {group.items.map((item) => (
                    <label
                      key={item._id}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFacetIds.has(item._id)}
                        onChange={() => toggleSidebarFacet(item._id)}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <span className="text-sm text-slate-700">
                        {t(item.name, item.nameHi)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {t("Rating", "रेटिंग")}
              </h3>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minRating === 4}
                  onChange={() =>
                    setMinRating((prev) => (prev === 4 ? null : 4))
                  }
                  className="w-4 h-4 accent-amber-600"
                />
                <span className="text-sm text-slate-700">
                  ⭐⭐⭐⭐ {t("4★ & above", "4★ और ऊपर")}
                </span>
              </label>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-sm text-slate-500">
              {t(
                `${sortedProducts.length} product${sortedProducts.length === 1 ? "" : "s"}`,
                `${sortedProducts.length} प्रोडक्ट`,
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openFilterPanel}
                className={`flex items-center gap-2 border rounded-lg text-sm font-medium px-3 py-2 transition-colors lg:hidden ${
                  activeFilterCount > 0
                    ? "border-amber-600 text-amber-700 bg-amber-50"
                    : "border-slate-300 text-slate-700 hover:border-amber-600 hover:text-amber-600"
                }`}
              >
                <FaFilter className="text-xs" />
                {t("Filter", "फ़िल्टर")}
                {activeFilterCount > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-slate-300 rounded-lg text-sm text-slate-700 px-3 py-2 outline-none"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t("Sort by: ", "इसके अनुसार क्रमबद्ध करें: ")}{opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {activePriceRange && (
                <button
                  type="button"
                  onClick={() => setPriceRangeId(null)}
                  className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                >
                  {activePriceRange.label}
                  <FaTimes className="text-[10px]" />
                </button>
              )}

              {minRating !== null && (
                <button
                  type="button"
                  onClick={() => setMinRating(null)}
                  className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                >
                  {minRating}★ {t("& above", "और ऊपर")}
                  <FaTimes className="text-[10px]" />
                </button>
              )}

              {facetGroups.flatMap((group) =>
                group.items
                  .filter((item) => selectedFacetIds.has(item._id))
                  .map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => removeFacet(item._id)}
                      className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                    >
                      {t(item.name, item.nameHi)}
                      <FaTimes className="text-[10px]" />
                    </button>
                  )),
              )}
            </div>
          )}

          <ProductGrid products={sortedProducts} />
        </div>
      </div>

      {isFilterOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[100]"
            onClick={() => setIsFilterOpen(false)}
          />

          <div className="fixed bottom-0 inset-x-0 z-[101] bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col sm:max-w-sm sm:left-auto sm:right-6 sm:bottom-6 sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {t("Filter", "फ़िल्टर")}
              </h2>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label={t("Close", "बंद करें")}
                className="text-slate-400 hover:text-slate-600"
              >
                <FaTimes />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  {t("Price", "कीमत")}
                </h3>

                <div className="space-y-3">
                  {priceRanges.map((range) => (
                    <label
                      key={range.id}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="price-range"
                        checked={draftPriceRangeId === range.id}
                        onChange={() => setDraftPriceRangeId(range.id)}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <span className="text-sm text-slate-700">
                        {range.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Same Material/Size/Bed Size groups as the desktop pill
                  rows above (see facetGroups) — this is how a mobile
                  visitor reaches them at all, since those rows are
                  hidden below sm. Checkboxes here are OR'd within a
                  group and AND'd across groups (matchesFacets). */}
              {facetGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    {t(friendlyGroupLabel(group.label), friendlyGroupLabelHi(group.label))}
                  </h3>

                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <label
                        key={item._id}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={draftFacetIds.has(item._id)}
                          onChange={() => toggleDraftFacet(item._id)}
                          className="w-4 h-4 accent-amber-600"
                        />
                        <span className="text-sm text-slate-700">
                          {t(item.name, item.nameHi)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  {t("Rating", "रेटिंग")}
                </h3>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftMinRating === 4}
                    onChange={() =>
                      setDraftMinRating((prev) => (prev === 4 ? null : 4))
                    }
                    className="w-4 h-4 accent-amber-600"
                  />
                  <span className="text-sm text-slate-700">
                    ⭐⭐⭐⭐ {t("4★ & above", "4★ और ऊपर")}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex-1 border border-slate-300 text-slate-700 font-medium rounded-full py-2.5 text-sm"
              >
                {t("Clear All", "सभी हटाएं")}
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-full py-2.5 text-sm"
              >
                {t("Apply Filters", "फ़िल्टर लागू करें")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CategoryPage;
