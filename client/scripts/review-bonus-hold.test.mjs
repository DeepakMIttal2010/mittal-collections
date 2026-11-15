// Review bonus held for a returned / cancelled item: the admin page shows
// the hold reason and a "Grant bonus" button that calls the grant endpoint.
//   node --test scripts/review-bonus-hold.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("the admin service calls POST /reviews/:id/grant-bonus", () => {
  const src = read("src/services/adminReviewService.js");
  assert.match(src, /export const grantReviewBonus/);
  assert.ok(src.includes('sendJson("POST", `/reviews/${id}/grant-bonus`'));
});

test("the admin page shows the hold reason and a Grant bonus button on held reviews only", () => {
  const src = read("src/pages/admin/AdminReviews.jsx");
  assert.match(src, /review\.bonusHold\?\.reason && !review\.reviewPointsProcessed/);
  assert.match(src, /canGrantBonus = hasPermission\(getCurrentAdminUser\(\), "loyalty"\)/);
  assert.match(src, /review\.isApproved && canGrantBonus && \(/, "Grant button hidden without loyalty");
  assert.match(src, /Bonus held:/);
  assert.match(src, />\s*Grant bonus\s*</);
  assert.match(
    src,
    /runAction\(id, async \(\) => \{\s*const response = await grantReviewBonus\(id\)/,
    "grant uses the busy-state runAction",
  );
  assert.ok(src.includes("grantReviewBonus(id)"));
  for (const reason of ["return_in_progress", "returned", "order_cancelled", "order_deleted", "return_rejected"]) {
    assert.match(src, new RegExp(`${reason}:`), reason);
  }
});

test("the public review components never read the bonus hold", () => {
  for (const file of ["src/components/ProductReviews.jsx", "src/components/CustomerGallery.jsx"]) {
    assert.doesNotMatch(read(file), /bonusHold/, file);
  }
});
