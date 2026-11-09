// When the guest welcome popup (components/WelcomeBenefitsPopup.jsx) may
// open. Pure so scripts/welcome-popup-trigger.test.mjs can test it.

// It used to open 2.5s after load, on top of the two banner strips, before
// a first-time visitor had seen a single product. Now: after the visitor
// has spent this long on the site, or scrolled this far down a page,
// whichever comes first.
export const WELCOME_DELAY_MS = 25000;
export const WELCOME_SCROLL_FRACTION = 0.5;

// At most once every 24 hours per browser. 24h (not once-ever) because
// this is a new, low-traffic site -- a repeat visit is still a real
// conversion opportunity worth a nudge.
export const WELCOME_SUPPRESS_MS = 24 * 60 * 60 * 1000;

// storedValue: the "shown at" timestamp from localStorage (string or null).
export const welcomeRecentlyShown = (storedValue, now = Date.now()) => {
  const lastShown = Number(storedValue || 0);
  return now - lastShown < WELCOME_SUPPRESS_MS;
};

// Has the visitor scrolled at least WELCOME_SCROLL_FRACTION of the page's
// scrollable height? A page that can't scroll never triggers on scroll
// (the timer still does).
export const scrolledFarEnough = (scrollY, scrollHeight, viewportHeight) => {
  const scrollable = scrollHeight - viewportHeight;
  return scrollable > 0 && scrollY / scrollable >= WELCOME_SCROLL_FRACTION;
};
