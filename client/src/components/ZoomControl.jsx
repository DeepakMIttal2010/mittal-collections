import { useEffect, useState } from "react";
import { FaSearchPlus, FaSearchMinus } from "react-icons/fa";
import { useLanguage } from "../context/LanguageContext";

const BASE_FONT_SIZE = 18;
const MIN_ZOOM = 80;
const MAX_ZOOM = 150;
const STEP = 10;

function ZoomControl() {
  const { t } = useLanguage();
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem("siteZoomLevel");
    return saved ? Number(saved) : 100;
  });

  useEffect(() => {
    document.documentElement.style.fontSize = `${(BASE_FONT_SIZE * zoom) / 100}px`;
    localStorage.setItem("siteZoomLevel", zoom);
  }, [zoom]);

  const zoomOut = () => setZoom((z) => Math.max(z - STEP, MIN_ZOOM));
  const zoomIn = () => setZoom((z) => Math.min(z + STEP, MAX_ZOOM));
  const reset = () => setZoom(100);

  return (
    <div className="fixed bottom-6 left-6 z-50 flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1.5">
      <button
        type="button"
        onClick={zoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label={t("Zoom out", "ज़ूम आउट")}
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <FaSearchMinus className="text-xs" />
      </button>

      <button
        type="button"
        onClick={reset}
        aria-label={t("Reset zoom", "ज़ूम रीसेट करें")}
        className="text-xs font-medium text-slate-600 hover:text-slate-900 px-1.5 min-w-[38px]"
      >
        {zoom}%
      </button>

      <button
        type="button"
        onClick={zoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label={t("Zoom in", "ज़ूम इन")}
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <FaSearchPlus className="text-xs" />
      </button>
    </div>
  );
}

export default ZoomControl;
