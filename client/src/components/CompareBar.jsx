import { Link } from "react-router-dom";
import { FaTimes, FaExchangeAlt } from "react-icons/fa";

import { useCompare } from "../context/CompareContext";
import { imgUrl } from "../services/api";

function CompareBar() {
  const { compareItems, removeFromCompare, clearCompare } = useCompare();

  if (compareItems.length === 0) return null;

  return (
    // Sits above the WhatsApp button and Back-to-top button rather than
    // sharing their row — at up to max-w-[94vw] wide and horizontally
    // centered, it would otherwise overlap the WhatsApp button on narrow
    // viewports. Both those buttons sit higher on mobile (bottom-20) to
    // clear BottomNav, so this shifts up to match on mobile too.
    <div className="fixed bottom-36 md:bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 max-w-[94vw] bg-white shadow-xl border border-slate-200 rounded-full pl-2.5 sm:pl-3 pr-3 sm:pr-4 py-2 overflow-hidden">
      <div className="hidden sm:flex items-center -space-x-2 shrink-0">
        {compareItems.map((product) => (
          <div key={product._id} className="relative">
            <img
              src={imgUrl(product.image)}
              alt={product.name}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-white"
            />
            <button
              type="button"
              onClick={() => removeFromCompare(product._id)}
              aria-label={`Remove ${product.name} from compare`}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center text-[9px]"
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>

      <span className="text-sm font-medium text-slate-700 whitespace-nowrap shrink-0">
        {compareItems.length} selected
      </span>

      <Link
        to="/compare"
        className="flex items-center gap-1.5 bg-blue-900 hover:bg-blue-950 text-white text-sm font-semibold rounded-full px-3 sm:px-4 py-2 transition-colors whitespace-nowrap shrink-0"
      >
        <FaExchangeAlt className="text-xs" />
        Compare
      </Link>

      <button
        type="button"
        onClick={clearCompare}
        aria-label="Clear compare list"
        className="text-slate-400 hover:text-slate-600 text-xs shrink-0"
      >
        Clear
      </button>
    </div>
  );
}

export default CompareBar;
