import { useState } from "react";
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

  const handleMinInput = (raw) => {
    const bounded = Math.max(min, Math.min(Number(raw) || min, min1));
    onChange([bounded, min1]);
  };

  const handleMaxInput = (raw) => {
    const bounded = Math.min(max, Math.max(Number(raw) || max, min0));
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
            value={displayMin}
            onChange={(e) => handleMinInput(e.target.value)}
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
            value={displayMax}
            onChange={(e) => handleMaxInput(e.target.value)}
            className="w-full text-sm text-slate-700 outline-none min-w-0"
          />
        </div>
      </div>
    </div>
  );
}

export default PriceRangeSlider;
