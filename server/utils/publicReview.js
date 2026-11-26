// What a review looks like to the public — the product page, the homepage
// customer-photo gallery, and (through the product API) the bot-rendered
// page and JSON-LD built from it.
//
// Two rules live here so every public path follows them the same way:
//
// 1. WHICH reviews are public — publicReviewFilter(). Every public query
//    (list, showcase, star-rating aggregates) starts from it, so a future
//    rule such as "not hidden by a moderator" is added in this one place.
//
// 2. WHICH FIELDS are public — toPublicReview(). An explicit allowlist:
//    a field added to the Review model later (admin notes, bonus data,
//    moderation info) stays private until someone deliberately adds it
//    here. Never res.json() a Review document on a public route.

// Base filter for every review shown publicly: approved by an admin AND
// not hidden by moderation. `$ne: true` (not `false`) so reviews stored
// before isHidden existed, which have no such field, still count as visible.
export const publicReviewFilter = (extra = {}) => ({
  ...extra,
  isApproved: true,
  isHidden: { $ne: true },
});

// Public reviews that may show their photos (the homepage gallery shows
// nothing else). Kept next to publicReviewFilter so both change together.
export const publicPhotoReviewFilter = (extra = {}) =>
  publicReviewFilter({
    ...extra,
    photoConsent: true,
    images: { $exists: true, $not: { $size: 0 } },
  });

const FALLBACK_NAME = "Customer";
const MAX_FIRST_NAME_GRAPHEMES = 20;

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// Graphemes, not UTF-16 units: a Devanagari letter is often a consonant
// plus a vowel sign ("मि"), and cutting between them would leave a broken
// character.
const graphemes = (text) => (segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text]);

// A "name" that is really an email address, a phone number or a URL is
// never shown, even shortened.
const looksLikeContactDetail = (text) => /@|https?:|www\./i.test(text) || /\d{3,}/.test(text.replace(/[\s-]/g, ""));

// "Deepak Kumar Mittal" -> "Deepak M.", "Deepak" -> "Deepak",
// "दीपक मित्तल" -> "दीपक मि.", "" / missing -> "Customer". Built on the
// server so the full name never leaves it.
export const shortReviewerName = (fullName) => {
  if (typeof fullName !== "string") return FALLBACK_NAME;

  const cleaned = fullName.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!cleaned || looksLikeContactDetail(cleaned)) return FALLBACK_NAME;

  // Letters (any script), combining marks (Devanagari vowel signs, virama)
  // and a few in-name characters only — strips stray punctuation/emoji.
  const parts = cleaned
    .split(" ")
    .map((part) => part.replace(/[^\p{L}\p{M}'.-]/gu, "").replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((part) => /\p{L}/u.test(part));

  if (parts.length === 0) return FALLBACK_NAME;

  const first = graphemes(parts[0]).slice(0, MAX_FIRST_NAME_GRAPHEMES).join("");
  if (parts.length === 1) return first;

  const initial = graphemes(parts[parts.length - 1])[0].toLocaleUpperCase();
  return `${first} ${initial}.`;
};

const idString = (value) => (value && value._id ? String(value._id) : value ? String(value) : null);

// The product a showcase review links to — only what the gallery card needs.
const publicProduct = (product) => {
  if (!product || typeof product !== "object" || !product._id) return null;

  return {
    _id: String(product._id),
    name: product.name || "",
    slug: product.slug || "",
    image: product.image || "",
  };
};

// review: a Review document or lean object, with `user` populated with
// at least `name` (an unpopulated or deleted user just reads "Customer").
export const toPublicReview = (review, { includeProduct = false } = {}) => {
  const r = review && typeof review.toObject === "function" ? review.toObject() : review;
  // A populated user carries `name`; an unpopulated id or a deleted
  // account (populate -> null) has none and reads "Customer".
  const userName = r.user && typeof r.user === "object" ? r.user.name : undefined;

  // Photos and the video are shown only with the reviewer's consent.
  // Older reviews, submitted before the consent box existed, keep their
  // media (the admin still sees it) but don't show it publicly.
  const mediaAllowed = r.photoConsent === true;

  const publicReview = {
    _id: idString(r._id),
    rating: r.rating,
    title: r.title || "",
    content: r.content || "",
    images: mediaAllowed && Array.isArray(r.images) ? [...r.images] : [],
    video: mediaAllowed && r.video ? r.video : "",
    createdAt: r.createdAt,
    // Kept in the { user: { name } } shape the client and the bot render
    // already read, but holding only the short public name.
    user: { name: shortReviewerName(userName) },
    // Set from the reviewer's own delivered order at submission (see
    // findDeliveredPurchase). Older reviews without that link are not
    // shown as verified.
    verifiedPurchase: Boolean(r.order),
    // Disclosure that the reviewer received the review bonus — a yes/no,
    // never the points themselves. Only while the bonus is still held: a
    // bonus taken back (item returned, order cancelled, or an admin
    // reversal) keeps pointsAwarded but sets bonusReversal, and then the
    // badge goes (RW-03, owner option A, 2026-11-26). The reversal record
    // itself is never copied into this object.
    rewarded: Number(r.pointsAwarded) > 0 && !r.bonusReversal?.reversedAt,
  };

  // The store's public reply (PR3a moderation) — text and dates only,
  // never which admin wrote it.
  if (r.adminReply && typeof r.adminReply.text === "string" && r.adminReply.text.trim()) {
    publicReview.adminReply = {
      text: r.adminReply.text,
      repliedAt: r.adminReply.repliedAt || null,
      updatedAt: r.adminReply.updatedAt || null,
    };
  }

  if (includeProduct) publicReview.product = publicProduct(r.product);

  return publicReview;
};
