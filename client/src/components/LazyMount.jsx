import { useEffect, useRef, useState } from "react";

// Defers mounting a below-the-fold section until it's about to scroll
// into view, instead of every homepage section rendering (and doing
// its own data fetch) all at once on initial load. A live throttled
// Lighthouse trace against the production site (2026-09-25) found
// roughly 1s of main-thread blocking time from exactly that -- 16
// sections stacked on Home.jsx, all mounting simultaneously.
//
// rootMargin starts the real mount 400px before the section is
// actually visible, so by the time a user scrolls to it, it's already
// fully rendered -- the wrapper div has no reserved height while
// waiting, but since the swap happens off-screen (below the current
// viewport) rather than at or above it, this doesn't reflow anything
// the user is currently looking at.
function LazyMount({ children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={ref}>{visible && children}</div>;
}

export default LazyMount;
