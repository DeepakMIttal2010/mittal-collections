// Review moderation (PR3a): the store's public reply under a review, and
// the admin hide/unhide, reply and filter controls.
//   node --test scripts/review-moderation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("the product page shows the reply with an EN/HI heading via t()", () => {
  const src = read("src/components/ProductReviews.jsx");

  assert.match(src, /t\("Reply from Mittal Collections", "Mittal Collections का जवाब"\)/);
  assert.match(src, /\{review\.adminReply\.text\}/, "reply rendered as a JSX text node");
});

test("no reply or review text is injected as HTML", () => {
  for (const file of ["src/components/ProductReviews.jsx", "src/pages/admin/AdminReviews.jsx"]) {
    assert.doesNotMatch(read(file), /dangerouslySetInnerHTML/, file);
  }
});

test("the public page never reads the admin who replied", () => {
  assert.doesNotMatch(read("src/components/ProductReviews.jsx"), /repliedBy/);
});

test("the admin service calls the moderation endpoints and sends only known filters", () => {
  const src = read("src/services/adminReviewService.js");

  for (const path of ["/reviews/${id}/hide", "/reviews/${id}/unhide", "/reviews/${id}/reply", "/reviews/admin/summary"]) {
    assert.ok(src.includes(path), path);
  }
  const keys = src.match(/REVIEW_FILTER_KEYS = \[([^\]]*)\]/)?.[1] || "";
  for (const key of ["status", "visibility", "rating", "hasPhotos", "rewarded", "from", "to"]) {
    assert.match(keys, new RegExp(`"${key}"`), key);
  }
});

test("the admin page offers hide/unhide, reply and the summary", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");

  for (const fn of ["hideReview(", "unhideReview(", "saveReviewReply(", "deleteReviewReply(", "getReviewSummaryAdmin("]) {
    assert.ok(src.includes(fn), fn);
  }
  assert.match(src, /Rewarded avg/);
  assert.match(src, /Not rewarded avg/);
});

test("admin list: stale responses are ignored and actions refresh without blanking", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");

  assert.match(src, /const requestId = \+\+listRequestRef\.current;/);
  assert.match(src, /if \(requestId !== listRequestRef\.current\) return;/);
  // Full loading only for foreground loads; actions use a background refresh.
  assert.match(src, /if \(!background\) setLoading\(true\);/);
  assert.match(src, /loadData\(\{ background: true \}\)/);
  assert.doesNotMatch(src, /reloadAll/);
});

test("admin list: per-review busy state disables that review's buttons", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");

  assert.match(src, /const busy = busyIds\.has\(review\._id\);/);
  for (const label of ["Approve", "Unhide", "Hide", "Save reply", "Remove reply", "Delete"]) {
    const re = new RegExp(String.raw`disabled=\{busy[^}]*\}[^>]*>\s*${label}\s*<`);
    assert.match(src, re, label);
  }
});

test("admin list: hidden reviews can't be approved, media consent tag, cap notice", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");

  assert.match(src, /disabled=\{busy \|\| review\.isHidden\}/);
  assert.ok(src.includes("Unhide before approving."));
  assert.ok(src.includes('"Photos public"') && src.includes('"Photos not public"'));
  assert.match(src, /listMeta\.truncated/);
  assert.match(read("src/services/adminReviewService.js"), /truncated: Boolean\(data\.truncated\)/);
});

test("admin reply editor: labelled textarea and an unsaved-draft prompt", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");

  assert.match(src, /<textarea\s+aria-label="Public reply to this review"/);
  assert.match(src, /window\.confirm\("Discard your unsaved reply on the other review\?"\)/);
});
