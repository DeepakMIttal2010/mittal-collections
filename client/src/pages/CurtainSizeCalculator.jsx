import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaRulerCombined, FaShoppingBag } from "react-icons/fa";

import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";

// English-only — feeds the FAQPage JSON-LD structured data, which should
// stay in the page's declared (English) language regardless of the UI
// toggle, same as this page's <Seo> title/description.
const FAQS_EN = [
  {
    q: "How do I calculate curtain size from window measurements?",
    a: "Measure your window's width and drop (height) in inches, then multiply the width by your chosen fullness (2x is standard) to get the fabric width you need. This calculator does that math for you and rounds it up to the nearest standard size sold in stores.",
  },
  {
    q: "How do I calculate curtain rod length?",
    a: "Rod length = window width + overhang on each side. For an outside-mount rod, add 4–6 inches of overhang per side so the curtain can fully clear the window when opened. Enter your window width above and pick \"Outside Mount\" to get the exact rod length.",
  },
  {
    q: "Does this calculator work in inches or feet?",
    a: "Enter your measurements in inches (the most common way windows are measured in India) — the calculator instantly converts and rounds the result to the nearest standard feet size (like 4x7 ft or 5x9 ft) that curtains are actually sold in.",
  },
  {
    q: "How much fabric width do I need for curtains?",
    a: "For a natural, gathered drape, buy 1.5–2.5 times your rod length in total fabric width — 2x (\"Full\") is the most popular choice. Split that total evenly across your number of panels (usually 2).",
  },
  {
    q: "What are the standard curtain sizes available in India?",
    a: "The most common ready-made curtain sizes are 4x5 ft, 4x7 ft, 4.5x7 ft, 5x7 ft, 5x9 ft and 7x9 ft — see the size chart below for which one fits your window.",
  },
];

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

function getFullnessOptions(t) {
  return [
    { value: 1.5, label: t("Standard (1.5x)", "स्टैंडर्ड (1.5x)"), hint: t("Light, sheer fabrics", "हल्के, शीयर फैब्रिक") },
    { value: 2, label: t("Full (2x)", "फुल (2x)"), hint: t("Most popular — balanced drape", "सबसे लोकप्रिय — संतुलित ड्रेप") },
    { value: 2.5, label: t("Extra Full (2.5x)", "एक्स्ट्रा फुल (2.5x)"), hint: t("Heavy fabrics, rich look", "भारी फैब्रिक, रिच लुक") },
  ];
}

function getClearanceOptions(t) {
  return [
    { value: 0, label: t("Just above floor", "फर्श से थोड़ा ऊपर") },
    { value: -1, label: t("Touching floor", "फर्श को छूता हुआ") },
    { value: 3, label: t("Puddle on floor", "फर्श पर पड्ल") },
  ];
}

function getPresets(t) {
  return [
    { label: t("Small window", "छोटी विंडो"), width: 48, height: 60 },
    { label: t("Large window / French door", "बड़ी विंडो / फ्रेंच डोर"), width: 60, height: 84 },
    { label: t("Door curtain", "डोर कर्टन"), width: 54, height: 84 },
    { label: t("Tall door curtain", "लंबा डोर कर्टन"), width: 48, height: 108 },
  ];
}

const STANDARD_WIDTHS_FT = [3, 3.5, 4, 4.5, 5, 6, 7];
const STANDARD_LENGTHS_FT = [4, 5, 6, 7, 7.5, 8, 9];

function getStandardSizeChart(t) {
  return [
    { size: "3 x 5 ft", use: t("Small window, cafe-style", "छोटी विंडो, कैफे-स्टाइल") },
    { size: "4 x 5 ft", use: t("Standard window", "स्टैंडर्ड विंडो") },
    { size: "4 x 7 ft", use: t("Standard window, floor-length", "स्टैंडर्ड विंडो, फर्श-लंबाई") },
    { size: "4.5 x 7 ft", use: t("Large window / French window", "बड़ी विंडो / फ्रेंच विंडो") },
    { size: "5 x 7 ft", use: t("Wide window / balcony door", "चौड़ी विंडो / बालकनी डोर") },
    { size: "5 x 9 ft", use: t("Door curtain, floor-length", "डोर कर्टन, फर्श-लंबाई") },
    { size: "7 x 9 ft", use: t("Large door / room divider", "बड़ा डोर / रूम डिवाइडर") },
  ];
}

function getFaqs(t) {
  return [
    {
      q: t(
        "How do I calculate curtain size from window measurements?",
        "विंडो के माप से कर्टन साइज़ कैसे निकालें?",
      ),
      a: t(
        "Measure your window's width and drop (height) in inches, then multiply the width by your chosen fullness (2x is standard) to get the fabric width you need. This calculator does that math for you and rounds it up to the nearest standard size sold in stores.",
        "अपनी विंडो की चौड़ाई और ड्रॉप (ऊंचाई) इंच में मापें, फिर चौड़ाई को अपनी चुनी हुई फुलनेस (2x स्टैंडर्ड है) से गुणा करें ताकि ज़रूरी फैब्रिक चौड़ाई मिल सके। यह कैलकुलेटर यह गणना आपके लिए करता है और इसे स्टोर में मिलने वाले सबसे नज़दीकी स्टैंडर्ड साइज़ तक राउंड कर देता है।",
      ),
    },
    {
      q: t("How do I calculate curtain rod length?", "कर्टन रॉड की लंबाई कैसे निकालें?"),
      a: t(
        "Rod length = window width + overhang on each side. For an outside-mount rod, add 4–6 inches of overhang per side so the curtain can fully clear the window when opened. Enter your window width above and pick \"Outside Mount\" to get the exact rod length.",
        "रॉड की लंबाई = विंडो की चौड़ाई + हर तरफ ओवरहैंग। आउटसाइड-माउंट रॉड के लिए, हर तरफ 4-6 इंच ओवरहैंग जोड़ें ताकि खोलने पर कर्टन पूरी तरह विंडो से हट जाए। सटीक रॉड लंबाई के लिए ऊपर अपनी विंडो चौड़ाई डालें और \"आउटसाइड माउंट\" चुनें।",
      ),
    },
    {
      q: t("Does this calculator work in inches or feet?", "क्या यह कैलकुलेटर इंच या फीट में काम करता है?"),
      a: t(
        "Enter your measurements in inches (the most common way windows are measured in India) — the calculator instantly converts and rounds the result to the nearest standard feet size (like 4x7 ft or 5x9 ft) that curtains are actually sold in.",
        "अपने माप इंच में डालें (भारत में विंडो मापने का सबसे आम तरीका) — कैलकुलेटर तुरंत बदलकर नतीजे को सबसे नज़दीकी स्टैंडर्ड फीट साइज़ (जैसे 4x7 फीट या 5x9 फीट) तक राउंड कर देता है जिनमें कर्टन असल में बिकते हैं।",
      ),
    },
    {
      q: t("How much fabric width do I need for curtains?", "कर्टन के लिए कितनी फैब्रिक चौड़ाई चाहिए?"),
      a: t(
        "For a natural, gathered drape, buy 1.5–2.5 times your rod length in total fabric width — 2x (\"Full\") is the most popular choice. Split that total evenly across your number of panels (usually 2).",
        "नैचुरल, गैदर्ड ड्रेप के लिए, अपनी रॉड लंबाई का 1.5-2.5 गुना कुल फैब्रिक चौड़ाई खरीदें — 2x (\"फुल\") सबसे लोकप्रिय चुनाव है। उस कुल को अपने पैनल की संख्या (आमतौर पर 2) में बराबर बांट लें।",
      ),
    },
    {
      q: t("What are the standard curtain sizes available in India?", "भारत में उपलब्ध स्टैंडर्ड कर्टन साइज़ क्या हैं?"),
      a: t(
        "The most common ready-made curtain sizes are 4x5 ft, 4x7 ft, 4.5x7 ft, 5x7 ft, 5x9 ft and 7x9 ft — see the size chart below for which one fits your window.",
        "सबसे आम रेडी-मेड कर्टन साइज़ 4x5 फीट, 4x7 फीट, 4.5x7 फीट, 5x7 फीट, 5x9 फीट और 7x9 फीट हैं — नीचे साइज़ चार्ट में देखें कि आपकी विंडो के लिए कौन सा सही है।",
      ),
    },
  ];
}

const roundUpToStandard = (valueFt, standardList) => {
  const match = standardList.find((ft) => ft >= valueFt);
  return match || standardList[standardList.length - 1];
};

function CurtainSizeCalculator() {
  const { t } = useLanguage();
  const [widthIn, setWidthIn] = useState(48);
  const [heightIn, setHeightIn] = useState(84);
  const [mount, setMount] = useState("outside");
  const [overhangIn, setOverhangIn] = useState(4);
  const [panels, setPanels] = useState(2);
  const [fullness, setFullness] = useState(2);
  const [clearanceIn, setClearanceIn] = useState(0);

  const result = useMemo(() => {
    const width = Number(widthIn) || 0;
    const height = Number(heightIn) || 0;
    const overhang = mount === "outside" ? Number(overhangIn) || 0 : 0;

    const rodLengthIn = width + overhang * 2;
    const totalFabricWidthIn = rodLengthIn * fullness;
    const panelWidthIn = totalFabricWidthIn / Math.max(Number(panels) || 1, 1);
    const curtainLengthIn = height + Number(clearanceIn);

    const rodLengthFt = rodLengthIn / 12;
    const panelWidthFt = panelWidthIn / 12;
    const curtainLengthFt = curtainLengthIn / 12;

    return {
      rodLengthIn: Math.round(rodLengthIn),
      rodLengthFt: rodLengthFt.toFixed(1),
      panelWidthIn: Math.round(panelWidthIn),
      panelWidthFt: panelWidthFt.toFixed(1),
      curtainLengthIn: Math.round(curtainLengthIn),
      curtainLengthFt: curtainLengthFt.toFixed(1),
      suggestedWidthFt: roundUpToStandard(panelWidthFt, STANDARD_WIDTHS_FT),
      suggestedLengthFt: roundUpToStandard(curtainLengthFt, STANDARD_LENGTHS_FT),
    };
  }, [widthIn, heightIn, mount, overhangIn, panels, fullness, clearanceIn]);

  const applyPreset = (preset) => {
    setWidthIn(preset.width);
    setHeightIn(preset.height);
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Curtain Size Calculator",
      applicationCategory: "UtilitiesApplication",
      description:
        "Free tool to calculate the curtain size, rod length and fabric width you need based on your window measurements.",
      url: "https://www.mittalcollections.com/curtain-size-calculator",
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
  const fullnessOptions = getFullnessOptions(t);
  const clearanceOptions = getClearanceOptions(t);
  const presets = getPresets(t);
  const standardSizeChart = getStandardSizeChart(t);
  const faqs = getFaqs(t);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Seo
        title="Curtain Size & Rod Length Calculator (in Inches) — Find Your Perfect Fit"
        description="Free curtain size calculator. Enter your window measurements in inches and instantly get the rod length, fabric width and curtain length to buy, plus a standard curtain size chart."
        url="https://www.mittalcollections.com/curtain-size-calculator"
        jsonLd={jsonLd}
      />

      <div className="flex items-center gap-3 mb-2">
        <span className="w-10 h-10 rounded-full bg-blue-900/10 text-blue-900 flex items-center justify-center shrink-0">
          <FaRulerCombined />
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
          {t("Curtain Size Calculator", "कर्टन साइज़ कैलकुलेटर")}
        </h1>
      </div>
      <p className="text-slate-500 mb-8 max-w-2xl">
        {t(
          "Measure your window once, answer a few quick questions, and get the exact rod length, fabric width and curtain length you should buy — no guesswork.",
          "अपनी विंडो को एक बार मापें, कुछ छोटे सवालों के जवाब दें, और सही रॉड लंबाई, फैब्रिक चौड़ाई और कर्टन लंबाई पाएं — कोई अंदाज़ा नहीं।",
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t("Not sure of exact measurements? Start with a preset:", "सटीक माप पता नहीं? किसी प्रीसेट से शुरू करें:")}
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="text-xs font-medium border border-slate-300 rounded-full px-3 py-1.5 text-slate-600 hover:border-blue-900 hover:text-blue-900 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("Window Width (inches)", "विंडो की चौड़ाई (इंच)")}
              </label>
              <input
                type="number"
                min="0"
                value={widthIn}
                onChange={(e) => setWidthIn(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("Drop / Height (inches)", "ड्रॉप / ऊंचाई (इंच)")}
              </label>
              <input
                type="number"
                min="0"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-xs text-slate-400 mt-1">
                {t("Rod to where the curtain should end", "रॉड से जहां तक कर्टन ख़त्म होना चाहिए")}
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
                    mount === m.value
                      ? "border-blue-900 bg-blue-50"
                      : "border-slate-200"
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
                  <span className="block font-medium text-slate-800">
                    {m.label}
                  </span>
                  <span className="text-xs text-slate-500">{m.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {mount === "outside" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("Overhang each side (inches)", "हर तरफ ओवरहैंग (इंच)")}
              </label>
              <input
                type="number"
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("Number of Panels", "पैनल की संख्या")}
            </label>
            <div className="flex gap-2">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPanels(n)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                    panels === n
                      ? "border-blue-900 bg-blue-900 text-white"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  {t(`${n} panel${n > 1 ? "s" : ""}`, `${n} पैनल`)}
                </button>
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
                    fullness === f.value
                      ? "border-blue-900 bg-blue-50"
                      : "border-slate-200"
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
                  <span className="block text-xs font-semibold text-slate-800">
                    {f.label}
                  </span>
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
                  key={c.label}
                  className={`border rounded-lg p-2.5 cursor-pointer text-center text-xs font-medium ${
                    clearanceIn === c.value
                      ? "border-blue-900 bg-blue-50 text-blue-900"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="clearance"
                    value={c.value}
                    checked={clearanceIn === c.value}
                    onChange={(e) => setClearanceIn(Number(e.target.value))}
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
          <div className="sticky top-4 border border-slate-200 rounded-xl p-6 bg-white shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">
              {t("Your Recommended Size", "आपका अनुशंसित साइज़")}
            </h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">{t("Rod Length", "रॉड लंबाई")}</span>
                <span className="font-semibold text-slate-900">
                  {result.rodLengthIn}&quot; ({result.rodLengthFt} ft)
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">
                  {t("Fabric Width / Panel", "फैब्रिक चौड़ाई / पैनल")}
                </span>
                <span className="font-semibold text-slate-900">
                  {result.panelWidthIn}&quot; ({result.panelWidthFt} ft)
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-slate-500">{t("Curtain Length", "कर्टन लंबाई")}</span>
                <span className="font-semibold text-slate-900">
                  {result.curtainLengthIn}&quot; ({result.curtainLengthFt} ft)
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-xs text-amber-700 font-medium mb-1">
                {t("Closest standard size to buy", "खरीदने के लिए सबसे नज़दीकी स्टैंडर्ड साइज़")}
              </p>
              <p className="text-lg font-bold text-amber-900">
                {result.suggestedWidthFt} ft × {result.suggestedLengthFt} ft
                <span className="text-xs font-normal text-amber-700">
                  {" "}
                  {t("(per panel)", "(प्रति पैनल)")}
                </span>
              </p>
            </div>

            <Link
              to="/category/curtains"
              className="flex items-center justify-center gap-2 w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors"
            >
              <FaShoppingBag className="text-sm" />
              {t("Shop Curtains", "कर्टन खरीदें")}
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-12 max-w-2xl text-sm text-slate-500 leading-relaxed">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          {t("How to measure your window for curtains", "कर्टन के लिए अपनी विंडो कैसे मापें")}
        </h2>
        <p className="mb-2">
          {t(
            "Use a metal tape measure, not cloth, for accuracy. For width, measure the window frame edge to edge — the calculator adds the overhang and fullness for you. For length, decide first where the rod will sit (usually 4–6 inches above the frame), then measure straight down to where you want the curtain to end.",
            "सटीकता के लिए कपड़े की नहीं, धातु की टेप माप का इस्तेमाल करें। चौड़ाई के लिए, विंडो फ्रेम को किनारे से किनारे तक मापें — कैलकुलेटर ओवरहैंग और फुलनेस अपने आप जोड़ देता है। लंबाई के लिए, पहले तय करें कि रॉड कहां बैठेगी (आमतौर पर फ्रेम से 4-6 इंच ऊपर), फिर सीधे नीचे तक मापें जहां आप कर्टन ख़त्म करना चाहते हैं।",
          )}
        </p>
        <p>
          {t("Prefer a written, step-by-step version? ", "लिखित, स्टेप-बाय-स्टेप वर्शन चाहिए? ")}
          <Link
            to="/articles/curtain-measurement-guide"
            className="text-blue-700 hover:underline"
          >
            {t("Read our full curtain measurement guide →", "हमारी पूरी कर्टन मेज़रमेंट गाइड पढ़ें →")}
          </Link>
        </p>
      </div>

      <div className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          {t("Standard Curtain Size Chart (India)", "स्टैंडर्ड कर्टन साइज़ चार्ट (भारत)")}
        </h2>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Size", "साइज़")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Best For", "सबसे उपयुक्त")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {standardSizeChart.map((row) => (
                <tr key={row.size}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {row.size}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          {t("Frequently Asked Questions", "अक्सर पूछे जाने वाले सवाल")}
        </h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.q}>
              <p className="font-medium text-slate-800 text-sm mb-1">
                {faq.q}
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CurtainSizeCalculator;
