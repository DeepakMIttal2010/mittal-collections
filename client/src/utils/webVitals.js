import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals";

// Every CWV number this codebase has acted on so far (the Hero CLS
// measurements, the mobile LCP diagnosis, this session's "did
// performance really regress or was that one run noisy" questions) came
// from a one-off manual Lighthouse/PageSpeed run — a lab simulation on
// one machine at one moment, not what real visitors on real phones over
// real Indian mobile networks actually experience. This reports the
// same metrics Lighthouse estimates, but as real-user data (RUM) via
// GA4, using the exact event shape web.dev's own integration guide
// recommends — so "did this get better" can be answered from an
// aggregate of real sessions instead of re-running PageSpeed and hoping
// that one run is representative.
//
// Routes through the same window.gtag the rest of analytics.js uses —
// index.html's gtag stub is already skipped on localhost/admin, so this
// is a no-op there too without duplicating that exclusion logic here.
const sendToGA = (metric) => {
  if (typeof window.gtag !== "function") return;

  window.gtag("event", metric.name, {
    // GA4 event params must be whole numbers for a numeric metric to be
    // usable in standard reports — CLS is a small decimal (e.g. 0.08),
    // everything else is already a millisecond count.
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    // "good" | "needs-improvement" | "poor" — web-vitals' own threshold
    // classification, the same bands PageSpeed/Lighthouse use, so this
    // is directly comparable to a lab report instead of a raw number
    // needing its own re-interpretation.
    metric_rating: metric.rating,
  });
};

// Call once at app bootstrap (see main.jsx). CLS and INP only reach
// their final value once the page is actually being torn down (a tab
// close/navigation), which is also when a browser is most likely to
// drop a plain fetch — web-vitals' own reportAllChanges:false default
// already handles firing these at the right moments reliably.
export const reportWebVitals = () => {
  onCLS(sendToGA);
  onINP(sendToGA);
  onLCP(sendToGA);
  onFCP(sendToGA);
  onTTFB(sendToGA);
};
