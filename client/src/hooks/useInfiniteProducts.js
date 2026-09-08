import { useEffect, useRef, useState } from "react";

// fetchPage(page) => Promise<{ success, products, totalCount, hasMore }> —
// each service function (getProductsByMaxPrice, searchProducts, ...) already
// forwards `page` straight to getProducts' opt-in pagination, so this hook
// stays generic over which listing it's paging through.
//
// deps mirrors useEffect's own dependency array — pass whatever the fetch
// itself depends on (a maxPrice, a search query, a sort option) so changing
// any of them resets back to page 1 instead of appending onto a now-stale
// list.
export function useInfiniteProducts(fetchPage, deps) {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Bumped on every dep change so a slow page-1 response that resolves
  // after the deps have already moved on doesn't clobber the newer
  // request's results — the classic stale-fetch race.
  const requestIdRef = useRef(0);

  // A ref, not just the `loadingMore` state — when the initial content is
  // shorter than one screen, the scroll-driven effect in
  // VirtualizedProductGrid can call loadMore() more than once before a
  // setState from the first call has actually re-rendered (state updates
  // aren't synchronous), so a state-only guard lets two calls both read
  // the same stale `page` and both fetch the same "next" page — this
  // mutates immediately, so the second call sees it before either fetch
  // resolves.
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    loadingMoreRef.current = false;
    setLoading(true);
    setProducts([]);
    setPage(1);
    setHasMore(true);
    setTotalCount(null);

    fetchPage(1).then((res) => {
      if (requestId !== requestIdRef.current) return;

      if (res.success) {
        setProducts(res.products);
        setTotalCount(res.totalCount ?? res.products.length);
        setHasMore(Boolean(res.hasMore));
      }
      setLoading(false);
    });
    // fetchPage is expected to be stable per the caller's own deps (it
    // closes over the same values listed in `deps`) — re-running this
    // effect off `deps` directly, same as any other data-fetching effect
    // in this codebase, rather than needing fetchPage itself memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = () => {
    if (loading || loadingMoreRef.current || !hasMore) return;

    loadingMoreRef.current = true;
    const requestId = requestIdRef.current;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetchPage(nextPage).then((res) => {
      loadingMoreRef.current = false;

      if (requestId !== requestIdRef.current) return;

      if (res.success) {
        setProducts((prev) => [...prev, ...res.products]);
        setPage(nextPage);
        setHasMore(Boolean(res.hasMore));
      }
      setLoadingMore(false);
    });
  };

  return { products, loading, loadingMore, hasMore, totalCount, loadMore };
}
