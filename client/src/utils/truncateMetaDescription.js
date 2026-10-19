// A plain `.slice(0, maxLength)` cuts mid-word roughly 2 out of 3 times
// on this catalog's real description lengths (confirmed via a live-DOM
// audit, 2026-10-19) -- e.g. "...lighter and s" instead of "...lighter
// and smooth". Backs up to the last whitespace boundary within the
// budget instead, then trims any punctuation/whitespace left dangling
// by that cut. Works for Hindi text too since Devanagari also
// space-separates words.
export function truncateAtWordBoundary(text, maxLength = 160) {
  if (!text || text.length <= maxLength) return text || "";
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[\s,.;:—-]+$/, "");
}
