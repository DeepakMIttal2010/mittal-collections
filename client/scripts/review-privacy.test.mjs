// Review privacy, labels and photo consent (PR3b).
// - The review form has an unticked photo-consent checkbox (EN/HI) and
//   sends photoConsent only when the customer ticks it.
// - Reviews show "Verified purchase" and the loyalty-points disclosure
//   from the server's yes/no flags.
// - The bot-rendered product page (api/render.js) builds Review JSON-LD
//   from a fixed set of fields, so even an unexpected private field in
//   the API response never reaches the markup.
//   node --test scripts/review-privacy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const REVIEWS_JSX = read("../src/components/ProductReviews.jsx");
const GALLERY_JSX = read("../src/components/CustomerGallery.jsx");
const DETAILS_JSX = read("../src/pages/ProductDetails.jsx");

test("review form: photo-consent checkbox starts unticked and has EN/HI text", () => {
  assert.match(REVIEWS_JSX, /const \[photoConsent, setPhotoConsent\] = useState\(false\)/);
  assert.match(REVIEWS_JSX, /type="checkbox"[\s\S]{0,80}name="photoConsent"[\s\S]{0,40}checked=\{photoConsent\}/);
  assert.ok(REVIEWS_JSX.includes('"I agree that my photos/video may be shown publicly with my review"'));
  assert.ok(REVIEWS_JSX.includes('"मैं सहमत हूँ कि मेरी फ़ोटो/वीडियो मेरे रिव्यू के साथ सार्वजनिक रूप से दिखाए जा सकते हैं"'));
  // The checkbox never squashes next to a long (Hindi) label.
  assert.match(REVIEWS_JSX, /name="photoConsent"[\s\S]{0,700}className="mt-0\.5 h-4 w-4 shrink-0 accent-amber-500"/);
});

test("review copy: new Hindi strings say 'रिव्यू', not 'समीक्षा'", () => {
  assert.doesNotMatch(REVIEWS_JSX, /समीक्षा/);
  assert.doesNotMatch(GALLERY_JSX, /समीक्षा/);
});

test("review form: errors are red alerts; the consent error sits next to the checkbox", () => {
  // Success stays green, errors are red with role="alert".
  assert.match(REVIEWS_JSX, /formMessage\?\.type === "success"[\s\S]{0,120}text-green-700/);
  assert.match(REVIEWS_JSX, /formMessage\?\.type === "error"[\s\S]{0,120}role="alert"[\s\S]{0,40}text-red-700/);
  // Server 400s and NOT_ELIGIBLE go through the red error path.
  assert.match(REVIEWS_JSX, /showError\(response\.message \|\| t\("Unable to submit review"/);
  // Consent: inline alert linked to the checkbox via aria-describedby,
  // and the checkbox is scrolled to and focused.
  assert.match(REVIEWS_JSX, /aria-describedby=\{consentError \? "review-photo-consent-error" : undefined\}/);
  assert.match(REVIEWS_JSX, /id="review-photo-consent-error"\s*role="alert"[\s\S]{0,40}text-red-700/);
  assert.match(REVIEWS_JSX, /response\.code === "PHOTO_CONSENT_REQUIRED"\) \{\s*showConsentError\(\);/);
  assert.match(REVIEWS_JSX, /scrollIntoView[\s\S]{0,120}\.focus\(/);
});

test("review form: consent is sent only when ticked, and media without it is stopped", () => {
  assert.match(REVIEWS_JSX, /if \(hasMedia && photoConsent\) payload\.append\("photoConsent", "true"\)/);
  assert.match(REVIEWS_JSX, /if \(hasMedia && !photoConsent\) \{\s*showConsentError\(\);\s*return;/);
  assert.match(REVIEWS_JSX, /response\.code === "PHOTO_CONSENT_REQUIRED"/);
  // Reset after a successful submission.
  assert.match(REVIEWS_JSX, /setPhotoConsent\(false\)/);
});

test("review list: verified and rewarded badges in EN/HI, from the server flags", () => {
  assert.match(REVIEWS_JSX, /review\.verifiedPurchase && \(/);
  assert.match(REVIEWS_JSX, /review\.rewarded && \(/);
  assert.ok(REVIEWS_JSX.includes('t("Verified purchase", "सत्यापित खरीद")'));
  assert.ok(REVIEWS_JSX.includes('"Received 50 loyalty points for reviewing", "रिव्यू के लिए 50 लॉयल्टी पॉइंट मिले"'));
  assert.match(REVIEWS_JSX, /<ReviewBadges review=\{review\} t=\{t\} \/>/);
  // The browser never sees (or reads) the points field.
  assert.doesNotMatch(REVIEWS_JSX, /pointsAwarded/);
  assert.doesNotMatch(GALLERY_JSX, /pointsAwarded/);
});

test("review section: honest-review note near the form/list in EN/HI", () => {
  assert.ok(REVIEWS_JSX.includes("whatever the star rating"));
  assert.ok(REVIEWS_JSX.includes("रेटिंग चाहे जो भी हो"));
});

test("homepage gallery: rewarded disclosure and no 'Verified Buyer' fallback", () => {
  assert.match(GALLERY_JSX, /review\.rewarded && \(/);
  // Short label on the small gallery tile (the full one is in the
  // review list), allowed two lines instead of being truncated.
  assert.ok(GALLERY_JSX.includes('t("Got review points", "रिव्यू पॉइंट मिले")'));
  assert.match(GALLERY_JSX, /line-clamp-2">\s*\{t\("Got review points"/);
  assert.doesNotMatch(GALLERY_JSX, /Verified Buyer/);
});

test("client JSON-LD has no review structured data (owner decision D)", () => {
  assert.doesNotMatch(DETAILS_JSX, /aggregateRating\s*:/);
  assert.doesNotMatch(DETAILS_JSX, /"@type":\s*"Review"/);
});

// ---- Bot render (api/render.js) -------------------------------------------

const API = "https://api.test";
process.env.VITE_API_URL = API;
const { default: handler } = await import("../api/render.js");

const SITE = "https://www.mittalcollections.com";
const SHELL = read("../index.html");
const PRODUCT = JSON.parse(read("./fixtures/render-product-satin-curtain.json"));
const P = PRODUCT.product;
const EN_PATH = `/product/${P._id}/${P.slug}`;

const PHOTO = "https://res.cloudinary.com/demo/image/upload/v1/review-photo.jpg";

// Public-shaped reviews, plus private fields an older or broken API could
// send — none of them may reach the JSON-LD.
const REVIEWS = {
  success: true,
  totalReviews: 2,
  averageRating: 4.5,
  reviews: [
    {
      _id: "r1",
      rating: 5,
      title: "",
      content: "Lovely colour",
      images: [PHOTO],
      video: "",
      createdAt: "2026-11-01T10:00:00.000Z",
      user: { name: "Deepak M.", email: "leak@example.com", _id: "u-leak" },
      verifiedPurchase: true,
      rewarded: true,
      order: "o-leak",
      pointsAwarded: 50,
      adminNote: "SECRET-NOTE",
    },
    {
      _id: "r2",
      rating: 4,
      title: "",
      content: "Good",
      images: [],
      video: "",
      createdAt: "2026-10-01T10:00:00.000Z",
      user: { name: "Customer" },
      verifiedPurchase: false,
      rewarded: false,
    },
  ],
};

globalThis.fetch = async (url) => {
  url = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (url === `${SITE}/index.html`) return { ok: true, status: 200, text: async () => SHELL };
  if (url === `${API}/api/products/${P._id}`) return json(PRODUCT);
  if (url === `${API}/api/settings`) return json({ success: true, settings: {} });
  if (url.startsWith(`${API}/api/reviews/product/`)) return json(REVIEWS);
  if (url.startsWith(`${API}/api/questions/`)) return json({ success: true, questions: [] });
  if (url.startsWith(`${API}/api/products?category=`)) return json({ success: true, products: [] });
  if (url.startsWith(`${API}/api/articles?category=`)) return json({ success: true, articles: [] });
  throw new Error(`unexpected fetch ${url}`);
};

async function render(path) {
  let status = 200;
  let body = "";
  const res = { setHeader() {}, status(c) { status = c; return res; }, send(b) { body = b; }, redirect(c, u) { status = c; body = u; } };
  await handler(
    { query: { path }, headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", host: "www.mittalcollections.com" } },
    res,
  );
  return { status, body };
}

const productJsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => [JSON.parse(m[1])].flat())
    .flatMap((d) => (Array.isArray(d["@graph"]) ? d["@graph"] : [d]))
    .find((d) => d["@type"] === "Product");

test("bot render: no review structured data (owner decision D) and no review data leaks", async () => {
  const { status, body } = await render(EN_PATH);
  assert.equal(status, 200);

  const product = productJsonLd(body);
  assert.ok(product, "Product JSON-LD missing");
  assert.equal(product.aggregateRating, undefined);
  assert.equal(product.review, undefined);

  for (const leak of ["leak@example.com", "u-leak", "o-leak", "SECRET-NOTE", "pointsAwarded", "verifiedPurchase", "rewarded"]) {
    assert.ok(!body.includes(leak), `${leak} leaked into the rendered page`);
  }
});
