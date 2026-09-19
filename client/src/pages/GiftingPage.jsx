import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa6";
import { FaFilter, FaTimes } from "react-icons/fa";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import "./GiftingPage.css";

import { getGiftingProductsByCategory } from "../services/productService";
import { getSiteSettings } from "../services/settingsService";
import { toWhatsAppNumber } from "../utils/whatsapp";
import ProductGrid from "../components/ProductGrid/ProductGrid";
import ProductGridSkeleton from "../components/ProductGrid/ProductGridSkeleton";
import Seo from "../components/Seo";
import Breadcrumbs from "../components/Breadcrumbs";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { useLanguage } from "../context/LanguageContext";
import { SITE_URL } from "../utils/siteUrl";

const BREADCRUMB_ITEMS = [{ name: "Home", path: "/" }, { name: "Gifting" }];

// Grouped-by-category is the browse mode (mirrors NewArrivalsPage) — each
// category's section shows PAGE_SIZE products by default, "Show More"
// reveals another PAGE_SIZE at a time from what's already been fetched.
// The moment a customer picks a Category/Subcategory/Price filter (or a
// non-default sort), the page switches to a single flat, sorted grid of
// matching products instead — same mode-switch Amazon/Flipkart use once
// you start narrowing a listing down.
const PAGE_SIZE = 8;
const FETCH_LIMIT = 40;

function getSortOptions(t) {
  return [
    { value: "featured", label: t("Featured", "फ़ीचर्ड") },
    { value: "price-asc", label: t("Price, low to high", "कीमत, कम से ज़्यादा") },
    { value: "price-desc", label: t("Price, high to low", "कीमत, ज़्यादा से कम") },
  ];
}

function sortFlatProducts(products, sortBy) {
  const sorted = [...products];
  if (sortBy === "price-asc") sorted.sort((a, b) => a.price - b.price);
  else if (sortBy === "price-desc") sorted.sort((a, b) => b.price - a.price);
  // "featured" keeps the fetch order as-is (backend already sorts newest-first).
  return sorted;
}

function GiftingPage() {
  const [sections, setSections] = useState([]);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const { t } = useLanguage();

  const [selectedCategoryIds, setSelectedCategoryIds] = useState(new Set());
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState(new Set());
  // null = no price filter applied (full range). Otherwise [min, max] in
  // rupees, driven by either the slider or the manual number boxes —
  // both write to the same state, so they always stay in sync.
  const [priceRange, setPriceRange] = useState(null);
  const [sortBy, setSortBy] = useState("featured");
  const [visibleFlatCount, setVisibleFlatCount] = useState(PAGE_SIZE);

  // Mobile filter sheet uses a draft copy, only committed on "Apply
  // Filters" — same reasoning as CategoryPage: opening the sheet,
  // changing your mind, and tapping outside shouldn't silently apply a
  // filter you never confirmed. The desktop sidebar applies instantly.
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftCategoryIds, setDraftCategoryIds] = useState(new Set());
  const [draftSubcategoryIds, setDraftSubcategoryIds] = useState(new Set());
  const [draftPriceRange, setDraftPriceRange] = useState(null);

  useEffect(() => {
    getGiftingProductsByCategory(FETCH_LIMIT).then((response) => {
      if (response.success) {
        setSections(response.sections);
        setVisibleCounts(
          Object.fromEntries(
            response.sections.map((s) => [s.category._id, PAGE_SIZE]),
          ),
        );
      }
      setLoading(false);
    });

    getSiteSettings().then((response) => {
      if (response.success && response.settings.phone) {
        setPhone(response.settings.phone);
      }
    });
  }, []);

  const sortOptions = useMemo(() => getSortOptions(t), [t]);

  // One flat list of every gifting product across every section, each
  // carrying its own category — the filter/sort layer works off this,
  // independent of how the grouped browse view renders the same data.
  const allProducts = useMemo(
    () =>
      sections.flatMap((section) =>
        section.products.map((product) => ({ ...product, _category: section.category })),
      ),
    [sections],
  );

  // The slider/number-box bounds — rounded up to a clean ₹100 so the top
  // handle doesn't sit at an odd number like ₹1,847.
  const absoluteMaxPrice = useMemo(() => {
    const highest = allProducts.reduce((max, p) => Math.max(max, p.price), 0);
    return Math.max(Math.ceil(highest / 100) * 100, 100);
  }, [allProducts]);

  const [priceMin, priceMax] = priceRange || [0, absoluteMaxPrice];
  const isPriceActive = priceRange !== null && (priceMin > 0 || priceMax < absoluteMaxPrice);

  const matchesCategory = (product) =>
    selectedCategoryIds.size === 0 || selectedCategoryIds.has(product._category._id);
  const matchesSubcategory = (product) =>
    selectedSubcategoryIds.size === 0 ||
    (product.subcategories || []).some((sc) => selectedSubcategoryIds.has(sc._id));
  const matchesPrice = (product) =>
    !isPriceActive || (product.price >= priceMin && product.price <= priceMax);

  // Facet option lists, each with a live count computed against every
  // OTHER active filter (not itself) — so picking a category narrows the
  // subcategory/price counts, same cross-filtering behaviour shoppers
  // expect from Amazon/Flipkart's left-rail filters. Options with a
  // resulting count of zero are hidden rather than shown disabled.
  const categoryOptions = useMemo(() => {
    const byId = new Map();
    for (const product of allProducts) {
      if (!matchesSubcategory(product) || !matchesPrice(product)) continue;
      const cat = product._category;
      byId.set(cat._id, { ...cat, count: (byId.get(cat._id)?.count || 0) + 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, selectedSubcategoryIds, priceRange]);

  const subcategoryOptions = useMemo(() => {
    const byId = new Map();
    for (const product of allProducts) {
      if (!matchesCategory(product) || !matchesPrice(product)) continue;
      for (const sc of product.subcategories || []) {
        byId.set(sc._id, { ...sc, count: (byId.get(sc._id)?.count || 0) + 1 });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts, selectedCategoryIds, priceRange]);

  const activeFilterCount =
    selectedCategoryIds.size + selectedSubcategoryIds.size + (isPriceActive ? 1 : 0);
  const isFilteredView = activeFilterCount > 0 || sortBy !== "featured";

  const flatFilteredProducts = useMemo(() => {
    const filtered = allProducts.filter(
      (p) => matchesCategory(p) && matchesSubcategory(p) && matchesPrice(p),
    );
    return sortFlatProducts(filtered, sortBy);
  }, [allProducts, selectedCategoryIds, selectedSubcategoryIds, priceRange, sortBy]);

  useEffect(() => {
    setVisibleFlatCount(PAGE_SIZE);
  }, [selectedCategoryIds, selectedSubcategoryIds, priceRange, sortBy]);

  const toggleCategory = (id) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSubcategory = (id) => {
    setSelectedSubcategoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDraftCategory = (id) => {
    setDraftCategoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDraftSubcategory = (id) => {
    setDraftSubcategoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openFilterPanel = () => {
    setDraftCategoryIds(new Set(selectedCategoryIds));
    setDraftSubcategoryIds(new Set(selectedSubcategoryIds));
    setDraftPriceRange(priceRange);
    setIsFilterOpen(true);
  };

  const applyFilters = () => {
    setSelectedCategoryIds(draftCategoryIds);
    setSelectedSubcategoryIds(draftSubcategoryIds);
    setPriceRange(draftPriceRange);
    setIsFilterOpen(false);
  };

  const clearAllFilters = () => {
    setSelectedCategoryIds(new Set());
    setSelectedSubcategoryIds(new Set());
    setPriceRange(null);
    setDraftCategoryIds(new Set());
    setDraftSubcategoryIds(new Set());
    setDraftPriceRange(null);
    setIsFilterOpen(false);
  };

  // Shared by both the slider and the manual number boxes (desktop
  // instant-apply and the mobile draft) — clamps to [0, absoluteMaxPrice]
  // and keeps min from ever crossing above the current max or vice versa.
  const buildPriceUpdater = (setter, current) => ({
    onSliderChange: (value) => setter(value),
    onMinChange: (value) => {
      const bounded = Math.max(0, Math.min(Number(value) || 0, current[1]));
      setter([bounded, current[1]]);
    },
    onMaxChange: (value) => {
      const bounded = Math.min(absoluteMaxPrice, Math.max(Number(value) || 0, current[0]));
      setter([current[0], bounded]);
    },
  });

  const priceUpdater = buildPriceUpdater(setPriceRange, [priceMin, priceMax]);
  const [draftPriceMin, draftPriceMax] = draftPriceRange || [0, absoluteMaxPrice];
  const draftPriceUpdater = buildPriceUpdater(setDraftPriceRange, [
    draftPriceMin,
    draftPriceMax,
  ]);

  const removeCategory = (id) =>
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const removeSubcategory = (id) =>
    setSelectedSubcategoryIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const showMore = (categoryId, total) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [categoryId]: Math.min((prev[categoryId] || PAGE_SIZE) + PAGE_SIZE, total),
    }));
  };

  // A separate, gifting-specific WhatsApp message (not the generic
  // floating WhatsAppButton every page already has) — bulk/corporate
  // gifting orders are exactly the kind of thing that needs a human
  // conversation rather than the normal add-to-cart flow.
  const bulkWaLink = phone
    ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
        "Hi, I'd like to enquire about a bulk/corporate gifting order from Mittal Collections.",
      )}`
    : null;

  const filterGroups = (
    <>
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("Category", "श्रेणी")}
        </h3>
        <div className="space-y-2.5">
          {categoryOptions.map((cat) => (
            <label key={cat._id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCategoryIds.has(cat._id)}
                onChange={() => toggleCategory(cat._id)}
                className="w-4 h-4 accent-amber-600"
              />
              <span className="text-sm text-slate-700">
                {t(cat.name, cat.nameHi)} <span className="text-slate-400">({cat.count})</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {subcategoryOptions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("Subcategory", "उप-श्रेणी")}
          </h3>
          <div className="space-y-2.5">
            {subcategoryOptions.map((sc) => (
              <label key={sc._id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSubcategoryIds.has(sc._id)}
                  onChange={() => toggleSubcategory(sc._id)}
                  className="w-4 h-4 accent-amber-600"
                />
                <span className="text-sm text-slate-700">
                  {t(sc.name, sc.nameHi)} <span className="text-slate-400">({sc.count})</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("Price", "कीमत")}
        </h3>
        <div className="px-1 gifting-price-slider">
          <Slider
            range
            min={0}
            max={absoluteMaxPrice}
            value={[priceMin, priceMax]}
            onChange={priceUpdater.onSliderChange}
            allowCross={false}
          />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <span className="text-slate-400 text-sm">₹</span>
            <input
              type="number"
              min={0}
              max={priceMax}
              value={priceMin}
              onChange={(e) => priceUpdater.onMinChange(e.target.value)}
              className="w-full text-sm text-slate-700 outline-none min-w-0"
            />
          </div>
          <span className="text-slate-400 text-sm">–</span>
          <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <span className="text-slate-400 text-sm">₹</span>
            <input
              type="number"
              min={priceMin}
              max={absoluteMaxPrice}
              value={priceMax}
              onChange={(e) => priceUpdater.onMaxChange(e.target.value)}
              className="w-full text-sm text-slate-700 outline-none min-w-0"
            />
          </div>
        </div>
      </div>
    </>
  );

  const draftFilterGroups = (
    <>
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("Category", "श्रेणी")}
        </h3>
        <div className="space-y-3">
          {categoryOptions.map((cat) => (
            <label key={cat._id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draftCategoryIds.has(cat._id)}
                onChange={() => toggleDraftCategory(cat._id)}
                className="w-4 h-4 accent-amber-600"
              />
              <span className="text-sm text-slate-700">
                {t(cat.name, cat.nameHi)} <span className="text-slate-400">({cat.count})</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {subcategoryOptions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("Subcategory", "उप-श्रेणी")}
          </h3>
          <div className="space-y-3">
            {subcategoryOptions.map((sc) => (
              <label key={sc._id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSubcategoryIds.has(sc._id)}
                  onChange={() => toggleDraftSubcategory(sc._id)}
                  className="w-4 h-4 accent-amber-600"
                />
                <span className="text-sm text-slate-700">
                  {t(sc.name, sc.nameHi)} <span className="text-slate-400">({sc.count})</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("Price", "कीमत")}
        </h3>
        <div className="px-1 gifting-price-slider">
          <Slider
            range
            min={0}
            max={absoluteMaxPrice}
            value={[draftPriceMin, draftPriceMax]}
            onChange={draftPriceUpdater.onSliderChange}
            allowCross={false}
          />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <span className="text-slate-400 text-sm">₹</span>
            <input
              type="number"
              min={0}
              max={draftPriceMax}
              value={draftPriceMin}
              onChange={(e) => draftPriceUpdater.onMinChange(e.target.value)}
              className="w-full text-sm text-slate-700 outline-none min-w-0"
            />
          </div>
          <span className="text-slate-400 text-sm">–</span>
          <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <span className="text-slate-400 text-sm">₹</span>
            <input
              type="number"
              min={draftPriceMin}
              max={absoluteMaxPrice}
              value={draftPriceMax}
              onChange={(e) => draftPriceUpdater.onMaxChange(e.target.value)}
              className="w-full text-sm text-slate-700 outline-none min-w-0"
            />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Seo
        title="Gifting — Home Furnishing Gift Ideas"
        description="Ready-to-gift home furnishing picks at Mittal Collections — filter by category, subcategory and price to find the right gift for housewarmings, weddings and festive occasions."
        url={`${SITE_URL}/gifting`}
        jsonLd={buildBreadcrumbJsonLd(BREADCRUMB_ITEMS)}
      />

      <Breadcrumbs
        items={[
          { name: t("Home", "होम"), path: "/" },
          { name: t("Gifting", "गिफ्टिंग") },
        ]}
      />

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
        🎁 {t("Gifting", "गिफ्टिंग")}
      </h1>
      <p className="text-slate-500 mb-6">
        {t(
          "Ready-to-gift picks for housewarmings, weddings and festive occasions — filter by category, subcategory or price to find the right one.",
          "हाउसवार्मिंग, शादी और त्योहारों के लिए तैयार गिफ्ट पसंद — सही गिफ्ट खोजने के लिए श्रेणी, उप-श्रेणी या कीमत से फ़िल्टर करें।",
        )}
      </p>

      {bulkWaLink && (
        <a
          href={bulkWaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mb-10 p-4 rounded-xl bg-[#e9fbef] border border-[#25D366]/30 hover:bg-[#dcf8e6] transition-colors"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366] text-white shrink-0">
            <FaWhatsapp className="text-lg" />
          </span>
          <span className="text-sm text-slate-700">
            <span className="font-semibold">
              {t("Want it in bulk?", "बल्क में चाहिए?")}
            </span>{" "}
            {t(
              "For bulk or corporate gifting orders, contact us on WhatsApp.",
              "बल्क या कॉर्पोरेट गिफ्टिंग ऑर्डर के लिए, हमें WhatsApp पर संपर्क करें।",
            )}
          </span>
        </a>
      )}

      {loading ? (
        <ProductGridSkeleton />
      ) : sections.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {t(
            "No gifting picks right now — check back soon!",
            "अभी कोई गिफ्टिंग आइटम नहीं है — जल्द ही वापस देखें!",
          )}
        </p>
      ) : (
        <div className="lg:flex lg:gap-8 lg:items-start">
          <aside className="hidden lg:block w-64 shrink-0 sticky top-24 self-start">
            {/* Extra left padding (pl-14, not the usual p-4 all round) —
                the fixed WhatsAppButton sits bottom-left of the viewport
                (~x:16-60px), and this panel is tall enough (Category +
                Subcategory + a price slider with two number boxes) that
                whichever row ends up at the bottom of the viewport can
                land directly under it — confirmed: the price Min box was
                genuinely hidden/unclickable behind the button at a
                900px-tall viewport. Bottom padding alone doesn't fix this
                (it only adds space after the last row, it doesn't move
                that row) — indenting every row's content clear of the
                button's column is what actually works, for whichever row
                ends up at the bottom. */}
            <div className="border border-slate-200 rounded-lg pt-4 pr-4 pb-4 pl-14 space-y-6">
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
              {filterGroups}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <p className="text-sm text-slate-500">
                {isFilteredView
                  ? t(
                      `${flatFilteredProducts.length} gift${flatFilteredProducts.length === 1 ? "" : "s"} found`,
                      `${flatFilteredProducts.length} गिफ्ट मिले`,
                    )
                  : t(
                      `${allProducts.length} gift${allProducts.length === 1 ? "" : "s"} available`,
                      `${allProducts.length} गिफ्ट उपलब्ध`,
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
                      {t("Sort by: ", "इसके अनुसार क्रमबद्ध करें: ")}
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {categoryOptions
                  .filter((cat) => selectedCategoryIds.has(cat._id))
                  .map((cat) => (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => removeCategory(cat._id)}
                      className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                    >
                      {t(cat.name, cat.nameHi)}
                      <FaTimes className="text-[10px]" />
                    </button>
                  ))}

                {subcategoryOptions
                  .filter((sc) => selectedSubcategoryIds.has(sc._id))
                  .map((sc) => (
                    <button
                      key={sc._id}
                      type="button"
                      onClick={() => removeSubcategory(sc._id)}
                      className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                    >
                      {t(sc.name, sc.nameHi)}
                      <FaTimes className="text-[10px]" />
                    </button>
                  ))}

                {isPriceActive && (
                  <button
                    type="button"
                    onClick={() => setPriceRange(null)}
                    className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-full pl-3 pr-2 py-1.5"
                  >
                    ₹{priceMin} – ₹{priceMax}
                    <FaTimes className="text-[10px]" />
                  </button>
                )}
              </div>
            )}

            {isFilteredView ? (
              flatFilteredProducts.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-slate-500 mb-4">
                    {t(
                      "No gifts match your filters.",
                      "आपके फ़िल्टर से कोई गिफ्ट मेल नहीं खाता।",
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-blue-700 font-semibold hover:underline"
                  >
                    {t("Clear filters", "फ़िल्टर हटाएं")}
                  </button>
                </div>
              ) : (
                <>
                  <ProductGrid products={flatFilteredProducts.slice(0, visibleFlatCount)} />

                  {flatFilteredProducts.length > visibleFlatCount && (
                    <div className="flex justify-center mt-8">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleFlatCount((prev) =>
                            Math.min(prev + PAGE_SIZE, flatFilteredProducts.length),
                          )
                        }
                        className="border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-semibold px-8 py-2.5 rounded-full transition-colors"
                      >
                        {t("Show More", "और दिखाएं")}
                      </button>
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="space-y-16">
                {sections.map(({ category, products }) => {
                  const visibleCount = visibleCounts[category._id] || PAGE_SIZE;
                  const visibleProducts = products.slice(0, visibleCount);
                  const hasMore = products.length > visibleCount;

                  return (
                    <section key={category._id}>
                      <div className="flex items-end justify-between mb-6 gap-4">
                        <h2 className="text-2xl font-bold text-slate-900">
                          {t(category.name, category.nameHi)}
                        </h2>

                        <Link
                          to={`/category/${category.slug}`}
                          className="shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
                        >
                          {t("View All", "सभी देखें")} →
                        </Link>
                      </div>

                      <ProductGrid products={visibleProducts} />

                      {hasMore && (
                        <div className="flex justify-center mt-8">
                          <button
                            type="button"
                            onClick={() => showMore(category._id, products.length)}
                            className="border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-semibold px-8 py-2.5 rounded-full transition-colors"
                          >
                            {t("Show More", "और दिखाएं")}
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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

            <div className="overflow-y-auto px-5 py-4 space-y-6">{draftFilterGroups}</div>

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

export default GiftingPage;
