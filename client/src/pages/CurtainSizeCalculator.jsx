import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaRulerCombined, FaShoppingBag } from "react-icons/fa";

import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";
import { getCategories } from "../services/categoryService";
import { getProductsByCategory } from "../services/productService";
import { SITE_URL } from "../utils/siteUrl";
import {
  CURTAIN_DEFAULTS,
  CURTAIN_FAQS,
  CURTAIN_PAGE_COPY,
  CURTAIN_PRESETS,
  CURTAIN_SIZES,
  FAQS_EN,
  calculateCurtain,
  countDesignsInStock,
  formatError,
  formatTip,
} from "../utils/curtainCalculator";

// All sizing logic lives in utils/curtainCalculator.js (unit tested). We
// stock one 4 ft panel width in two lengths -- 7x4 ft and 9x4 ft, written
// length x width -- so this page only ever recommends those (audit
// 2026-11-22, CS-01/02/03/05, owner decisions D1-D7).

function getMountTypes(t) {
  return [
    {
      value: "outside",
      label: t("Outside Mount", "आउटसाइड माउंट"),
      hint: t(
        "Rod fixed on the wall, above and beyond the window frame — makes the window look bigger and blocks more light.",
        "रॉड दीवार पर, विंडो फ्रेम के ऊपर और आगे लगी होती है — विंडो बड़ी दिखती है और ज़्यादा रोशनी रोकती है।",
      ),
    },
    {
      value: "inside",
      label: t("Inside Mount", "इनसाइड माउंट"),
      hint: t(
        "Rod fixed inside the window frame itself — neat, minimal look.",
        "रॉड विंडो फ्रेम के अंदर ही लगी होती है — साफ, मिनिमल लुक।",
      ),
    },
  ];
}

function getOpeningOptions(t) {
  return [
    { value: "both", label: t("Opens both sides", "दोनों तरफ खुलता है"), hint: t("Panels split left and right", "पैनल बाएं और दाएं बंटते हैं") },
    { value: "one", label: t("Opens one side", "एक तरफ खुलता है"), hint: t("All panels slide to one side", "सारे पैनल एक तरफ जाते हैं") },
  ];
}

function getFullnessOptions(t) {
  return [
    { value: 1.5, label: t("Standard (1.5x)", "स्टैंडर्ड (1.5x)"), hint: t("Most common, natural drape", "सबसे आम, नैचुरल ड्रेप") },
    { value: 2, label: t("Full (2x)", "फुल (2x)"), hint: t("Fuller, richer look", "ज़्यादा भरा, रिच लुक") },
    { value: 2.5, label: t("Extra Full (2.5x)", "एक्स्ट्रा फुल (2.5x)"), hint: t("Very full, heavy look", "बहुत भरा, भारी लुक") },
  ];
}

function getClearanceOptions(t) {
  return [
    { value: "above", label: t("Just above floor", "फर्श से थोड़ा ऊपर") },
    { value: "touching", label: t("Touching floor", "फर्श को छूता हुआ") },
    { value: "puddle", label: t("Puddle on floor", "फर्श पर पड्ल") },
  ];
}

// Static page copy lives in CURTAIN_PAGE_COPY (one source, mirrored for
// bots by api/render.js -- CS-04).
const COPY = CURTAIN_PAGE_COPY;
const tr = (t, pair) => t(pair.en, pair.hi);

function getSizeChart(t) {
  return COPY.sizes.rows.map((row) => ({
    size: CURTAIN_SIZES.find((s) => s.key === row.sizeKey),
    fits: tr(t, row.fits),
    use: tr(t, row.use),
  }));
}

const inch = (n) => `${n}"`;
const feet = (n) => (n / 12).toFixed(1);

function CurtainSizeCalculator() {
  const { t, language } = useLanguage();
  const lang = language === "hi" ? "hi" : "en";
  const [widthIn, setWidthIn] = useState(CURTAIN_DEFAULTS.widthIn);
  const [dropIn, setDropIn] = useState(CURTAIN_DEFAULTS.dropIn);
  const [mount, setMount] = useState(CURTAIN_DEFAULTS.mount);
  const [overhangIn, setOverhangIn] = useState(CURTAIN_DEFAULTS.overhangIn);
  const [opening, setOpening] = useState(CURTAIN_DEFAULTS.opening);
  const [fullness, setFullness] = useState(CURTAIN_DEFAULTS.fullness);
  const [clearance, setClearance] = useState(CURTAIN_DEFAULTS.clearance);
  // D4: live per-design stock; null = unknown (API failed / loading), so
  // the stock line is hidden rather than showing a made-up number.
  const [curtainProducts, setCurtainProducts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { success, categories } = await getCategories();
      const curtains = success && categories.find((c) => c.slug === "curtains");
      if (!curtains) return;
      const res = await getProductsByCategory(curtains._id);
      if (!cancelled && res.success) setCurtainProducts(res.products);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(
    () => calculateCurtain({ widthIn, dropIn, mount, overhangIn, fullness, opening, clearance }),
    [widthIn, dropIn, mount, overhangIn, fullness, opening, clearance],
  );

  const stockCount =
    result.ok && result.size ? countDesignsInStock(curtainProducts, result.size.key, result.panels) : null;

  const sizeLabel = (size) => (lang === "hi" ? size.labelHi : size.label);
  const panelsText = (n) => t(`${n} panel${n > 1 ? "s" : ""}`, `${n} पैनल`);

  const applyPreset = (preset) => {
    setWidthIn(preset.widthIn);
    setDropIn(preset.dropIn);
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Curtain Size Calculator",
      applicationCategory: "UtilitiesApplication",
      description:
        "Free tool to calculate the curtain size, rod length and fabric width you need based on your window measurements.",
      url: `${SITE_URL}/curtain-size-calculator`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS_EN.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  const mountTypes = getMountTypes(t);
  const openingOptions = getOpeningOptions(t);
  const fullnessOptions = getFullnessOptions(t);
  const clearanceOptions = getClearanceOptions(t);
  const sizeChart = getSizeChart(t);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Seo
        // Search Console (2026-09-25) showed a real "calculate curtain
        // size" query landing this page at position 83 despite the page
        // already having solid content/FAQ+WebApplication schema — the
        // title just didn't contain the phrase a searcher actually
        // types. Leads with it now, still well under the ~60-char
        // budget once " | Mittal Collections" is appended.
        title="Calculate Curtain Size & Rod Length"
        description="Calculate your curtain size, rod length and fabric width free — enter your window measurements and get the exact size to buy, plus a size chart."
        url={`${SITE_URL}/curtain-size-calculator`}
        jsonLd={jsonLd}
      />

      <div className="flex items-center gap-3 mb-2">
        <span className="w-10 h-10 rounded-full bg-blue-900/10 text-blue-900 flex items-center justify-center shrink-0">
          <FaRulerCombined />
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
          {tr(t, COPY.heading)}
        </h1>
      </div>
      <p className="text-slate-500 mb-8 max-w-2xl">
        {tr(t, COPY.intro)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("Not sure of exact measurements? Start with a preset:", "सटीक माप पता नहीं? किसी प्रीसेट से शुरू करें:")}
            </p>
            <div className="flex flex-wrap gap-2">
              {CURTAIN_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="text-xs font-medium border border-slate-300 rounded-full px-3 py-1.5 text-slate-600 hover:border-blue-900 hover:text-blue-900 transition-colors"
                >
                  {t(preset.label, preset.labelHi)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="calc-width" className="block text-sm font-medium text-slate-700 mb-1">
                {t("Window Width (inches)", "विंडो की चौड़ाई (इंच)")}
              </label>
              <input
                id="calc-width"
                type="number"
                inputMode="decimal"
                min="0"
                value={widthIn}
                onChange={(e) => setWidthIn(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>
            <div>
              <label htmlFor="calc-drop" className="block text-sm font-medium text-slate-700 mb-1">
                {t("Rod to floor (inches)", "रॉड से फ़र्श तक (इंच)")}
              </label>
              <input
                id="calc-drop"
                type="number"
                inputMode="decimal"
                min="0"
                value={dropIn}
                onChange={(e) => setDropIn(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-xs text-slate-400 mt-1">
                {t(
                  "From where the rod sits (or will sit) straight down to the floor",
                  "जहां रॉड लगी है (या लगेगी) वहां से सीधे फ़र्श तक",
                )}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("Mounting Type", "माउंटिंग टाइप")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {mountTypes.map((m) => (
                <label
                  key={m.value}
                  className={`border rounded-lg p-3 cursor-pointer text-sm ${
                    mount === m.value ? "border-blue-900 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="mount"
                    value={m.value}
                    checked={mount === m.value}
                    onChange={(e) => setMount(e.target.value)}
                    className="sr-only"
                  />
                  <span className="block font-medium text-slate-800">{m.label}</span>
                  <span className="text-xs text-slate-500">{m.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {mount === "outside" && (
            <div>
              <label htmlFor="calc-overhang" className="block text-sm font-medium text-slate-700 mb-1">
                {t("Overhang each side (inches)", "हर तरफ ओवरहैंग (इंच)")}
              </label>
              <input
                id="calc-overhang"
                type="number"
                inputMode="decimal"
                min="0"
                value={overhangIn}
                onChange={(e) => setOverhangIn(e.target.value)}
                className="w-32 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-xs text-slate-400 mt-1">
                {t(
                  "How far the rod extends past the window frame on each side — 4–6 inches is typical.",
                  "रॉड हर तरफ विंडो फ्रेम से कितनी आगे बढ़ती है — आमतौर पर 4-6 इंच होता है।",
                )}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("How does it open?", "कैसे खुलता है?")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {openingOptions.map((o) => (
                <label
                  key={o.value}
                  className={`border rounded-lg p-3 cursor-pointer text-sm ${
                    opening === o.value ? "border-blue-900 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="opening"
                    value={o.value}
                    checked={opening === o.value}
                    onChange={(e) => setOpening(e.target.value)}
                    className="sr-only"
                  />
                  <span className="block font-medium text-slate-800">{o.label}</span>
                  <span className="text-xs text-slate-500">{o.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("Fullness", "फुलनेस")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {fullnessOptions.map((f) => (
                <label
                  key={f.value}
                  className={`border rounded-lg p-2.5 cursor-pointer text-center ${
                    fullness === f.value ? "border-blue-900 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="fullness"
                    value={f.value}
                    checked={fullness === f.value}
                    onChange={(e) => setFullness(Number(e.target.value))}
                    className="sr-only"
                  />
                  <span className="block text-xs font-semibold text-slate-800">{f.label}</span>
                  <span className="text-[11px] text-slate-500">{f.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("Floor Clearance", "फ्लोर क्लियरेंस")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {clearanceOptions.map((c) => (
                <label
                  key={c.value}
                  className={`border rounded-lg p-2.5 cursor-pointer text-center text-xs font-medium ${
                    clearance === c.value
                      ? "border-blue-900 bg-blue-50 text-blue-900"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="clearance"
                    value={c.value}
                    checked={clearance === c.value}
                    onChange={(e) => setClearance(e.target.value)}
                    className="sr-only"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div>
          <div
            data-testid="calc-result"
            className="sticky top-4 border border-slate-200 rounded-xl p-6 bg-white shadow-sm"
          >
            <h2 className="font-semibold text-slate-800 mb-4">
              {t("Your Recommended Size", "आपका अनुशंसित साइज़")}
            </h2>

            {!result.ok ? (
              <div
                data-testid="calc-error"
                role="alert"
                className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 space-y-1"
              >
                {Object.entries(result.errors).map(([field, code]) => (
                  <p key={field}>{formatError(field, code, lang)}</p>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                    <span className="text-sm text-slate-500">{t("Rod Length", "रॉड लंबाई")}</span>
                    <span className="font-semibold text-slate-900">
                      {inch(result.rodLengthIn)} ({feet(result.rodLengthIn)} {t("ft", "फीट")})
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                    <span className="text-sm text-slate-500">{t("Panels (4 ft wide)", "पैनल (4 फीट चौड़े)")}</span>
                    <span data-testid="calc-panels" className="font-semibold text-slate-900">
                      {panelsText(result.panels)} · {result.achievedFullness}x {t("fullness", "फुलनेस")}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-500">{t("Curtain Length Needed", "ज़रूरी कर्टन लंबाई")}</span>
                    <span data-testid="calc-final-length" className="font-semibold text-slate-900">
                      {inch(result.finalLengthIn)} ({feet(result.finalLengthIn)} {t("ft", "फीट")})
                    </span>
                  </div>
                </div>

                {result.size ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <p className="text-xs text-amber-700 font-medium mb-1">
                      {t("Buy from our range", "हमारी रेंज से खरीदें")}
                    </p>
                    <p data-testid="calc-size" className="text-lg font-bold text-amber-900">
                      {sizeLabel(result.size)} × {panelsText(result.panels)}
                    </p>
                    {!result.fits && (
                      <p className="text-xs text-amber-800 mt-1">
                        {t(
                          `This curtain is ${inch(result.extraIn)} longer than you need — it will rest or bunch on the floor. We don't stock a shorter length.`,
                          `यह कर्टन आपकी ज़रूरत से ${inch(result.extraIn)} लंबा है — फ़र्श पर टिकेगा या इकट्ठा होगा। इससे छोटी लंबाई हमारे पास नहीं है।`,
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    data-testid="calc-no-fit"
                    role="alert"
                    className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-800"
                  >
                    {t(
                      `None of our curtains is long enough: our longest, 9×4 ft (108"), is ${inch(result.shortByIn)} shorter than you need.`,
                      `हमारा कोई कर्टन इतना लंबा नहीं है: सबसे लंबा, 9×4 फीट (108"), आपकी ज़रूरत से ${inch(result.shortByIn)} छोटा है।`,
                    )}
                  </div>
                )}

                {result.tip && (
                  <p
                    data-testid="calc-tip"
                    className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-900"
                  >
                    {formatTip(result.tip, lang)}
                  </p>
                )}

                {result.size && stockCount !== null && (
                  <p data-testid="calc-stock" className="text-xs text-slate-600 mb-4">
                    {stockCount > 0
                      ? t(
                          `${stockCount} design${stockCount > 1 ? "s" : ""} in stock with ${result.panels}+ panels of ${result.size.label}.`,
                          `${stockCount} डिज़ाइन में ${result.size.labelHi} के ${result.panels}+ पैनल स्टॉक में हैं।`,
                        )
                      : t(
                          `No design has ${result.panels} panels of ${result.size.label} in stock right now.`,
                          `अभी किसी डिज़ाइन में ${result.size.labelHi} के ${result.panels} पैनल स्टॉक में नहीं हैं।`,
                        )}
                  </p>
                )}

                {result.size && (
                  <Link
                    data-testid="calc-shop"
                    to={`/category/curtains/${result.size.subcategorySlug}`}
                    className="flex items-center justify-center gap-2 w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors"
                  >
                    <FaShoppingBag className="text-sm" />
                    {t(`Shop ${result.size.label} Curtains`, `${result.size.labelHi} कर्टन खरीदें`)}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 max-w-2xl text-sm text-slate-500 leading-relaxed">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          {tr(t, COPY.measure.heading)}
        </h2>
        <p className="mb-2">
          {tr(t, COPY.measure.text)}
        </p>
        <p>
          {tr(t, COPY.measure.guidePrompt)}
          <Link to={COPY.measure.guidePath} className="text-blue-700 hover:underline">
            {tr(t, COPY.measure.guideLinkText)}
          </Link>
        </p>
      </div>

      <div className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          {tr(t, COPY.sizes.heading)}
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          {tr(t, COPY.sizes.intro)}
        </p>
        <div data-testid="calc-size-chart" className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">{tr(t, COPY.sizes.columns.size)}</th>
                <th className="px-4 py-2.5 font-medium">{tr(t, COPY.sizes.columns.fits)}</th>
                <th className="px-4 py-2.5 font-medium">{tr(t, COPY.sizes.columns.use)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sizeChart.map((row) => (
                <tr key={row.size.key}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    <Link to={`/category/curtains/${row.size.subcategorySlug}`} className="hover:underline">
                      {sizeLabel(row.size)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{row.fits}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          {tr(t, COPY.faqHeading)}
        </h2>
        <div className="space-y-4">
          {CURTAIN_FAQS.map((faq) => (
            <div key={faq.q}>
              <p className="font-medium text-slate-800 text-sm mb-1">{t(faq.q, faq.qHi)}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{t(faq.a, faq.aHi)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CurtainSizeCalculator;
