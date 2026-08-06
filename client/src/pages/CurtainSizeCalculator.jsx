import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaRulerCombined, FaShoppingBag } from "react-icons/fa";

import Seo from "../components/Seo";

const MOUNT_TYPES = [
  {
    value: "outside",
    label: "Outside Mount",
    hint: "Rod fixed on the wall, above and beyond the window frame — makes the window look bigger and blocks more light.",
  },
  {
    value: "inside",
    label: "Inside Mount",
    hint: "Rod fixed inside the window frame itself — neat, minimal look.",
  },
];

const FULLNESS_OPTIONS = [
  { value: 1.5, label: "Standard (1.5x)", hint: "Light, sheer fabrics" },
  { value: 2, label: "Full (2x)", hint: "Most popular — balanced drape" },
  { value: 2.5, label: "Extra Full (2.5x)", hint: "Heavy fabrics, rich look" },
];

const CLEARANCE_OPTIONS = [
  { value: 0, label: "Just above floor" },
  { value: -1, label: "Touching floor" },
  { value: 3, label: "Puddle on floor" },
];

const PRESETS = [
  { label: "Small window", width: 48, height: 60 },
  { label: "Large window / French door", width: 60, height: 84 },
  { label: "Door curtain", width: 54, height: 84 },
  { label: "Tall door curtain", width: 48, height: 108 },
];

const STANDARD_WIDTHS_FT = [3, 3.5, 4, 4.5, 5, 6, 7];
const STANDARD_LENGTHS_FT = [4, 5, 6, 7, 7.5, 8, 9];

const roundUpToStandard = (valueFt, standardList) => {
  const match = standardList.find((ft) => ft >= valueFt);
  return match || standardList[standardList.length - 1];
};

function CurtainSizeCalculator() {
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Curtain Size Calculator",
    applicationCategory: "UtilitiesApplication",
    description:
      "Free tool to calculate the curtain size, rod length and fabric width you need based on your window measurements.",
    url: "https://www.mittalcollections.com/curtain-size-calculator",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Seo
        title="Curtain Size Calculator — Find Your Perfect Curtain Size"
        description="Free curtain size calculator. Enter your window measurements and get the ideal rod length, fabric width and curtain length instantly."
        url="https://www.mittalcollections.com/curtain-size-calculator"
        jsonLd={jsonLd}
      />

      <div className="flex items-center gap-3 mb-2">
        <span className="w-10 h-10 rounded-full bg-blue-900/10 text-blue-900 flex items-center justify-center shrink-0">
          <FaRulerCombined />
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
          Curtain Size Calculator
        </h1>
      </div>
      <p className="text-slate-500 mb-8 max-w-2xl">
        Measure your window once, answer a few quick questions, and get the
        exact rod length, fabric width and curtain length you should buy —
        no guesswork.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Not sure of exact measurements? Start with a preset:
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
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
                Window Width (inches)
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
                Drop / Height (inches)
              </label>
              <input
                type="number"
                min="0"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-xs text-slate-400 mt-1">
                Rod to where the curtain should end
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Mounting Type
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MOUNT_TYPES.map((m) => (
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
                Overhang each side (inches)
              </label>
              <input
                type="number"
                min="0"
                value={overhangIn}
                onChange={(e) => setOverhangIn(e.target.value)}
                className="w-32 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-xs text-slate-400 mt-1">
                How far the rod extends past the window frame on each side —
                4–6 inches is typical.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Number of Panels
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
                  {n} panel{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Fullness
            </p>
            <div className="grid grid-cols-3 gap-2">
              {FULLNESS_OPTIONS.map((f) => (
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
              Floor Clearance
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CLEARANCE_OPTIONS.map((c) => (
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
              Your Recommended Size
            </h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">Rod Length</span>
                <span className="font-semibold text-slate-900">
                  {result.rodLengthIn}&quot; ({result.rodLengthFt} ft)
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">
                  Fabric Width / Panel
                </span>
                <span className="font-semibold text-slate-900">
                  {result.panelWidthIn}&quot; ({result.panelWidthFt} ft)
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-slate-500">Curtain Length</span>
                <span className="font-semibold text-slate-900">
                  {result.curtainLengthIn}&quot; ({result.curtainLengthFt} ft)
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-xs text-amber-700 font-medium mb-1">
                Closest standard size to buy
              </p>
              <p className="text-lg font-bold text-amber-900">
                {result.suggestedWidthFt} ft × {result.suggestedLengthFt} ft
                <span className="text-xs font-normal text-amber-700">
                  {" "}
                  (per panel)
                </span>
              </p>
            </div>

            <Link
              to="/category/curtains"
              className="flex items-center justify-center gap-2 w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors"
            >
              <FaShoppingBag className="text-sm" />
              Shop Curtains
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-12 max-w-2xl text-sm text-slate-500 leading-relaxed">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          How to measure your window for curtains
        </h2>
        <p className="mb-2">
          Use a metal tape measure, not cloth, for accuracy. For width,
          measure the window frame edge to edge — the calculator adds the
          overhang and fullness for you. For length, decide first where the
          rod will sit (usually 4–6 inches above the frame), then measure
          straight down to where you want the curtain to end.
        </p>
        <p>
          Prefer a written, step-by-step version?{" "}
          <Link
            to="/articles/curtain-measurement-guide"
            className="text-blue-700 hover:underline"
          >
            Read our full curtain measurement guide →
          </Link>
        </p>
      </div>
    </div>
  );
}

export default CurtainSizeCalculator;
