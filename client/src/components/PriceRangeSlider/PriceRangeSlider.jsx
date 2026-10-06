import { useEffect, useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import "./PriceRangeSlider.css";

// Controlled dual-handle price filter: a drag slider + two manual number
// boxes, kept in sync. `value` is the COMMITTED [min, max] the caller
// filters by; `onChange` only fires once per interaction — on slider
// release, not on every drag tick — so a caller that re-filters a large
// product grid on every change doesn't reflow (and visibly scroll-jump)
// the page while the customer is still dragging. A local draft position
// drives what the slider/boxes display mid-drag.
function PriceRangeSlider({ min, max, value, onChange }) {
  const [min0, min1] = value;
  const [draft, setDraft] = useState(null);
  const [displayMin, displayMax] = draft || [min0, min1];

  // The number boxes keep their own free-typed text, only parsed/clamped
  // and pushed to the parent on blur — typing directly into `value` (via
  // `Number(raw) || min`) snapped an emptied box straight back to the
  // full min/max on the very first keystroke (`Number("") || max` is
  // `max`, since 0 is falsy), so clearing "2500" to type "50" produced
  // "250050" instead. Deferring to blur also means typing doesn't
  // re-filter the product grid per keystroke, same reasoning as the
  // slider's drag-vs-release split above.
  const [minText, setMinText] = useState(String(displayMin));
  const [maxText, setMaxText] = useState(String(displayMax));

  useEffect(() => setMinText(String(displayMin)), [displayMin]);
  useEffect(() => setMaxText(String(displayMax)), [displayMax]);

  const commitMin = (raw) => {
    const parsed = Number(raw);
    const numeric = raw.trim() === "" || Number.isNaN(parsed) ? min0 : parsed;
    const bounded = Math.max(min, Math.min(numeric, min1));
    onChange([bounded, min1]);
  };

  const commitMax = (raw) => {
    const parsed = Number(raw);
    const numeric = raw.trim() === "" || Number.isNaN(parsed) ? min1 : parsed;
    const bounded = Math.min(max, Math.max(numeric, min0));
    onChange([min0, bounded]);
  };

  return (
    <div>
      <div className="px-1 price-range-slider">
        <Slider
          range
          min={min}
          max={max}
          value={[displayMin, displayMax]}
          onChange={setDraft}
          onChangeComplete={(next) => {
            onChange(next);
            setDraft(null);
          }}
          allowCross={false}
        />
      </div>
      <div className="flex items-center gap-2 mt-4">
        <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
          <span className="text-slate-400 text-sm">₹</span>
          <input
            type="number"
            min={min}
            max={min1}
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={(e) => commitMin(e.target.value)}
            className="w-full text-sm text-slate-700 outline-none min-w-0"
          />
        </div>
        <span className="text-slate-400 text-sm">–</span>
        <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-0">
          <span className="text-slate-400 text-sm">₹</span>
          <input
            type="number"
            min={min0}
            max={max}
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={(e) => commitMax(e.target.value)}
            className="w-full text-sm text-slate-700 outline-none min-w-0"
          />
        </div>
      </div>
    </div>
  );
}

export default PriceRangeSlider;
