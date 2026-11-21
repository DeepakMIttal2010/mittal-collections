// How far down the homepage a visitor scrolled: 25/50/75/90% of the
// scrollable height, each sent once per homepage view (Home.jsx creates
// one tracker per mount). Pure, so scripts/home-section-tracking.test.mjs
// can test it without a browser.
//
// A depth, once sent, is never sent again for the same tracker -- not when
// the visitor scrolls back up and down, not when the page grows (lazy
// sections loading) or the window is resized and the same scroll position
// works out to a different percentage. A jump (End key, fast fling) sends
// every depth it crossed, in order. A page that can't scroll sends nothing.
export const SCROLL_DEPTHS = [25, 50, 75, 90];

export const createScrollDepthTracker = (send) => {
  const sent = new Set();
  return (scrollY, scrollHeight, viewportHeight) => {
    const scrollable = scrollHeight - viewportHeight;
    if (!(scrollable > 0)) return;
    const percent = (scrollY / scrollable) * 100;
    for (const depth of SCROLL_DEPTHS) {
      if (percent >= depth && !sent.has(depth)) {
        sent.add(depth);
        send(depth);
      }
    }
  };
};
