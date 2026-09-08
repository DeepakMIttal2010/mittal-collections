import { useEffect, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import ProductCard from "../ProductCard/ProductCard";
import { useLanguage } from "../../context/LanguageContext";
import "./ProductGrid.css";

// Mirrors ProductGrid.css's own breakpoints (2 cols under 768px, 3 under
// 1024px, 4 at 1024px+) — has to be read in JS too since the virtualizer
// needs to know how many cards make up one virtual "row" to size and
// position each row correctly; it can't just leave that to CSS the way
// the plain (non-virtualized) grid does.
function columnsForWidth(width) {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

function useColumnCount() {
  const [columns, setColumns] = useState(() =>
    typeof window === "undefined" ? 4 : columnsForWidth(window.innerWidth),
  );

  useEffect(() => {
    const handleResize = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return columns;
}

// Renders products in a real page-scroll (not an inner-scrollbar) virtual
// list: only the rows near the viewport actually mount ProductCards (plus
// `overscan` rows either side as a buffer), so the DOM and network/image
// cost stay flat no matter how many products have been loaded via
// `loadMore` — the thing a plain .map() over a big array can't do, since
// every card it renders stays mounted forever.
//
// `hasMore`/`loadingMore`/`onLoadMore` come straight from
// useInfiniteProducts — this component is the "when to actually call
// loadMore" half (watching scroll position via the virtualizer's own
// range), not the fetching itself.
function VirtualizedProductGrid({
  products = [],
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  const { t } = useLanguage();
  const columns = useColumnCount();

  const rows = [];
  for (let i = 0; i < products.length; i += columns) {
    rows.push(products.slice(i, i + columns));
  }

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 420,
    overscan: 3,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (!lastItem) return;
    if (lastItem.index >= rows.length - 1 && hasMore && !loadingMore) {
      onLoadMore?.();
    }
    // rows.length (not `rows` itself) is the real dependency — a new
    // array reference every render would re-fire this on every scroll
    // frame regardless of whether the visible range actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastItem?.index, rows.length, hasMore, loadingMore]);

  if (!products.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <h3>{t("No products found.", "कोई प्रोडक्ट नहीं मिला।")}</h3>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            className="product-grid"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {rows[virtualRow.index].map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <button
            type="button"
            onClick={() => onLoadMore?.()}
            disabled={loadingMore}
            className="load-more-btn"
          >
            {loadingMore
              ? t("Loading...", "लोड हो रहा है...")
              : t("Load More", "और लोड करें")}
          </button>
        </div>
      )}
    </>
  );
}

export default VirtualizedProductGrid;
