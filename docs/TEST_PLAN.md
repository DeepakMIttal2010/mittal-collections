# Test Plan

**Document version:** 1.4
**Last updated:** 2026-08-25

## 1. Testing Approach

Two automated suites exist now, covering the majority of this
document's checklist:

**Backend (`server/tests/`)** — the highest-value, most interlocking
business logic, using **Vitest + Supertest + `mongodb-memory-server`**:
```bash
cd server
npm test          # single run
npm run test:watch # watch mode
```
Each test file spins up its own isolated in-memory MongoDB instance
(no shared state between files, nothing touches the real dev/prod
database) and drives the real Express `app` (`server/app.js`) through
Supertest — these are integration tests against actual routes and
controllers, not unit tests against mocked pieces. Test files run
sequentially, not in parallel (`fileParallelism: false` in
`vitest.config.js`) — starting several `mongod` instances at once
reliably times out on a modest dev machine, and this suite is small
enough that running one file at a time costs seconds, not minutes.

**Browser E2E (`e2e/`)** — the parts of this checklist that only a
real browser can verify (popups, mobile layout, admin panel clicking,
notification bell UI, SEO markup), using **Playwright**:
```bash
cd e2e
npm test              # desktop viewport
npm run test:mobile   # 375px viewport
```
Requires both local dev servers already running (`e2e/README.md` has
full setup). Test users are created via the real API per file (shared
across that file's tests via `beforeAll` to stay under the auth rate
limiter, not one fresh user per test) — no mocking, this drives the
actual running app exactly as a browser user would.

As of 2026-08-25, `cd server && npm test` reports **15 test files, 84 tests, all passing** (up from the coverage described in the 2026-08-19 pass below, driven mainly by the COD-charge, order-delete/restore, and review-request features landing 2026-08-24).

Coverage today (`server/tests/`):
- **Order placement** — stock reserve + atomic rollback on a short item, delivery-fee/total calculation, auth requirement.
- **COD charge** (added 2026-08-24, `server/tests/order.test.js`) — a Cash on Delivery order's total includes `SiteSettings.codCharge`; a Razorpay order's does not. Note: Razorpay order creation itself isn't exercised end-to-end by this suite — there are no real Razorpay test credentials in the test environment, so the assertion only confirms `codCharge` is computed correctly *before* the (necessarily failing, in this environment) Razorpay API call — real Razorpay checkout/signature-verification behavior still needs the manual verification described in §3.2 below.
- **Order soft-delete / restore / permanent-delete** (added 2026-08-24, `server/tests/order.test.js`) — delete refused unless the order is Cancelled; soft-delete + restore round-trips correctly; permanent delete refused both on a non-soft-deleted order and on one with a linked return request; status can no longer be changed on a soft-deleted order; a non-admin is rejected.
- **First-order coupon eligibility after a cancelled order** (added 2026-08-24, `server/tests/coupon.test.js`) — a customer whose only prior order was Cancelled stays eligible for a first-order-only coupon, regression-guarding the historical bug where an admin-cancelled first order permanently burned welcome-coupon eligibility.
- **Admin Reports "Points Earned" nets clawback** (added 2026-08-24, `server/tests/admin-reports.test.js`) — a delivered-then-cancelled order's reversed points no longer inflate the reported Points Earned figure.
- **Post-delivery review-request cron** (new file, added 2026-08-24, `server/tests/review-request.test.js`) — the endpoint's secret guard; only Delivered orders past the delay that haven't already been requested are targeted; a second run doesn't re-target an order once a request has been recorded.
- **Loyalty points** — earn on delivery, no double-credit, clawback on cancelling a *delivered* order, refund-only on cancelling a *pending* order, redemption cap, one-time referral bonus payout.
- **Return approval side effects** — stock restore on Picked Up/Refunded, proportional loyalty clawback on Refunded (only the returned item's share, only if the order was ever delivered/credited), idempotency of both.
- **Return eligibility** — delivered-order-only, product-must-be-in-order, non-returnable products rejected, product-level `returnPeriodDays` override vs. `SiteSettings.defaultReturnPeriodDays` fallback, window-closed rejection, duplicate-request blocking.
- **Coupon restrictions** — unknown/inactive code rejected, percentage discount capped at `maxDiscount`, flat discount capped at the subtotal, first-order-only eligibility (both on `/validate` and silently during actual order placement — an ineligible coupon never blocks the order, it just doesn't apply).
- **Delivery fee tiers** — free at/above the threshold, correct graduated tier selected below it (tier order in the array doesn't matter), fallback to the flat fee when no tier matches or none are configured, defaults used when settings omits a field entirely. Pure unit test on `calculateDeliveryFee()` — no DB, no app, milliseconds to run.
- **CORS** — the storefront's own origin gets `Access-Control-Allow-Origin` back; an arbitrary origin does not; requests with no `Origin` header (server-to-server) still succeed.
- **Security headers** — `helmet`'s standard headers are present, and `Cross-Origin-Resource-Policy: cross-origin` specifically (this exact header broke legacy `/uploads` image loading once during initial helmet setup — regression-guarded here).
- **Auth rate limiting** — the 21st request to `/api/auth/*` within the window gets `429`, not silently allowed through.
- **Admin Reports date-range scoping** — `totalOrders`/`totalRevenue` correctly include only orders inside the selected `days` preset or custom `startDate`/`endDate`, both narrow and widened ranges checked against the same fixture data; `totalCustomers` stays all-time regardless of range (the one deliberate exception). This is a direct regression guard for the real historical bug where several summary metrics silently ignored the selected range.
- **Abandoned cart targeting** — the reminder endpoint's secret guard, and that only carts past the delay *and* not yet reminded are matched (a too-recent cart and an already-reminded cart are both correctly excluded); a second run doesn't re-target a cart once reminded. Doesn't depend on the outbound email actually succeeding — asserts on the query's `total` count, which is computed before any email is attempted.
- **Back-in-stock alerts** — duplicate subscriptions don't create a second `StockAlert`; restocking from 0 notifies every subscriber and marks them notified (with email mocked via `vi.mock` for determinism — this environment has real outbound network access, so hitting the real Brevo API would make the test depend on live credentials); only a subscriber with a matching registered account gets an in-app notification; restocking a product that was never at 0 doesn't fire anything. **Writing this test caught and fixed a real bug**: the in-app notification was nested inside the email's `try` block, so a bounced email silently also cost the customer the bell notification — moved it out to fire independently, matching every other notification type in the app.
- **Notification de-duplication** — exactly one `order_status` notification per status change (not zero, not duplicated across changes); ticket replies notify the customer exactly once per admin reply and never for their own reply; `mark-all-read` clears only that user's unread notifications; a user cannot mark another user's notification as read (404, not silently succeeding).
- **Wishlist** — duplicate-add rejected, remove/clear work, clearing one user's wishlist doesn't touch another's. **Writing this test caught and fixed a real bug**: `addToWishlist` left in debug `console.log`s dumping the full `req.user` object to server logs, and its error handler returned raw `error.message` + `error.stack` in the JSON response — an information-disclosure issue, inconsistent with every other controller's generic `"Server Error"` response. Both removed.
- **Addresses** — first address auto-becomes default even if not requested; only one address is ever default at a time; deleting the default address promotes another one; a user cannot read/update/delete another user's address (404, not 403 — doesn't even confirm the address exists).
- **Reviews & Questions** — a user can't submit two reviews for the same product; unapproved reviews are excluded from both the public list *and* the average-rating calculation; questions stay unpublished until an admin answers, and don't auto-publish on a blank answer even if `isPublished` is left unset.

E2E coverage today (`e2e/tests/`), 36 tests across 8 files:
- **Browsing/search** (`browsing.spec.js`) — category page loads real products and shows a friendly empty state for a nonexistent one, search returns results for a real term and doesn't crash on a nonsense one, autocomplete suggestions appear and navigate, product page renders gallery/price/Add to Cart, auto-compare table appears.
- **Cart/checkout** (`cart-checkout.spec.js`) — add to cart opens the drawer with matching name/price, logged-out checkout redirects to `/login?redirect=/checkout` and a logged-in customer with cart items actually reaches it.
- **Marketing widgets** (`marketing-widgets.spec.js`) — welcome popup appears for a guest and auto-closes, does **not** appear for a logged-in visitor (confirms the fix earlier in this session actually works in a real browser); WhatsApp buttons (site-wide + pre-filled product-page link + disabled-when-out-of-stock).
- **Compare + mobile viewport** (`compare-mobile.spec.js`) — add/clear via the real UI, and a 375px-viewport check that the compare bar stays within the viewport and doesn't overlap the WhatsApp button. **Found and fixed a real bug**: at 4 items the compare bar (centered, up to 94vw wide) visually overlapped the WhatsApp button — both sat at the same `bottom-6`. Moved the compare bar to `bottom-24` so it stacks above instead.
- **Notification Center** (`notifications.spec.js`) — bell badge count, dropdown, click-to-read-and-navigate, `/notifications` page, mark-all-read, bell absent when logged out.
- **Admin panel** (`admin.spec.js`) — non-admin and unauthenticated visitors redirected from `/admin`, admin login form rejects a non-admin account with a clear alert, admin notification bell shows a real new order and navigates to Orders on click.
- **SEO** (`seo.spec.js`) — unique title + **exactly one** meta description per page, Product/BreadcrumbList JSON-LD present and matching the visible breadcrumb trail exactly, homepage LocalBusiness schema, sitemap.xml/robots.txt content. **Found and fixed a real bug**: `index.html` had a static `<meta name="description">` that `react-helmet-async` never removes (it only manages tags it renders itself), so every single page carried two duplicate description tags. Removed the static one — every route already sets its own via the shared `<Seo>` component.

Everything else in this document is still manual — direct API smoke
tests via `curl` against both local and production for anything not
covered above, and manual verification for content that needs real
external tools (Google's Rich Results Test, actual email content/
delivery, live Cloudinary uploads) or is simply lower-value to
automate (CSV export contents, admin CRUD form field-by-field saves).

## 2. Pre-Deploy Sanity Checks (every change)

- [ ] `npm test` (server) passes — especially before touching `orderController.js`, `loyaltyPoints.js`, or anything under `server/tests/`.
- [ ] `cd e2e && npm test` passes against local dev servers — especially before touching `Header.jsx`, `Seo.jsx`, `CompareBar.jsx`, `WelcomeBenefitsPopup.jsx`, or anything under `e2e/tests/`.
- [ ] `npm run build` (client) completes with no errors.
- [ ] `npx eslint src` (client) shows **0 errors** (clean baseline as of 2026-08-08 — was 54 errors/7 warnings from `eslint-plugin-react-hooks@7`'s new `set-state-in-effect`/`immutability` rules and `react-refresh/only-export-components`; fixed 3 genuine temporal-dead-zone bugs, removed dead code and stale disable-comments, and disabled two rules in `eslint.config.js` that flagged extremely common safe patterns — see the comment there for why). 3 low-priority `exhaustive-deps` warnings remain, deliberately.
- [ ] Backend starts cleanly (`node server.js`) with no console errors, and connects to MongoDB.
- [ ] `curl` the endpoints touched by the change (both local and, after deploy, production) and check status codes + response shape.

## 3. Customer Flows

### 3.1 Browsing & Search
- [x] Category page loads products and shows a friendly empty state for one with none — automated in `e2e/tests/browsing.spec.js`. Filters/sorts on a populated category page still need a manual pass.
- [x] Search returns results for an exact term and doesn't crash on a nonsense one — automated. A genuinely *misspelled* term (fuzzy-match quality) still needs a manual judgment call — automated coverage can confirm it doesn't error, not that the ranking "feels right".
- [x] Autocomplete suggestions appear and navigate on click — automated.
- [x] Product detail page renders (gallery, price, Add to Cart, auto-compare table) without errors — automated. Video playback, the specs section's show/hide logic, and the "no related products" case still need a manual pass.

### 3.2 Cart & Checkout
- [x] Add to cart from the product page opens the drawer with matching name/price — automated in `e2e/tests/cart-checkout.spec.js`. Product-card and quick-view add-to-cart, and quantity-vs-stock limits, still need a manual pass.
- [x] `/cart` page shows the correct tiered delivery fee for subtotals just below, just at, and above the free-shipping threshold — spot-verified manually on 2026-08-19 (₹390→₹19 fee, ₹499→free, ₹590→free, matching `calculateDeliveryFee()` exactly). **Note:** `CartDrawer.jsx` doesn't render a numeric fee/total at all (by design — only a free-shipping progress message and "Shipping calculated at checkout"), so there's nothing to compare it against; not a bug, but the drawer and `/cart` page aren't actually showing "matching totals" since the drawer shows none.
- [x] Logged-out checkout redirects to `/login?redirect=/checkout`, and a logged-in customer with items in cart actually reaches the checkout page — automated.
- [x] Coupon: valid code applies and shows in the UI; expired/invalid code is rejected in the UI — spot-verified manually on 2026-08-19 (`WELCOME10` applied with correct -₹39 discount on a ₹390 cart; `NOTAREALCODE` rejected with a clear inline error, no crash). First-order-coupon eligibility surviving a Cancelled first order is separately automated in `server/tests/coupon.test.js` (added 2026-08-24, see §1).
- [x] Loyalty point redemption: slider caps correctly at the configured max %, and at the customer's actual balance — spot-verified manually on 2026-08-19 (balance 1000 vs order-value cap 99 → capped at 99; balance 20 vs cap 189 → capped at 20).
- [x] Place an order with insufficient stock on one line item — verify the whole order is rejected, the specific item is named, and no stock was deducted from the *other* items in the order (rollback check) — spot-verified manually on 2026-08-19 through the real checkout UI (both items' stock confirmed unchanged via API after rejection).
- [x] Successful order: cart clears, confirmation shown, order appears in "My Orders", stock is decremented — spot-verified manually on 2026-08-19 through the real checkout UI (stock decremented exactly by order quantity, confirmed via API).
- [ ] Razorpay checkout (default payment method as of 2026-08-24): selecting Razorpay opens the real Standard Checkout modal, a successful test-mode payment marks the order paid via `POST /api/orders/verify-payment`, and a dismissed/failed payment leaves the order Pending/unpaid and payable later from My Orders — not yet independently re-verified against a live browser session since being made the default; the `codCharge` half of order-total math is automated (`server/tests/order.test.js`, see §1), but the actual Razorpay modal/signature round-trip is not (no test credentials in the automated suite).
- [ ] COD handling charge: selecting Cash on Delivery shows the note and adds `SiteSettings.codCharge` to the Checkout summary, and the same figure appears on the customer's Order Details price breakdown and the admin Price Breakdown — order-total math is automated (§1); the UI display across all three surfaces still needs a manual pass.
- [ ] Full price breakdown on customer Order Details (items, delivery fee, COD charge, coupon discount, bundle discount + qualifying categories, points redeemed) renders correctly and matches what was actually charged at order time — not yet covered by an automated test.

### 3.3 Account
- [x] Every account page (My Orders, Order Details, Loyalty History, Addresses, Add/Edit Address, Change Password, Account, Edit Profile) redirects a logged-out visitor to login and returns them afterward — none should silently show an empty/broken state. Spot-verified manually on 2026-08-19 across all 9 account routes. **Found and fixed a real bug**: `AddressForm.jsx`'s edit-address page correctly redirected a logged-out visitor to `/login?redirect=/addresses/edit/:id`, but a second effect (the address-loading effect) ran anyway regardless of login state, failed unauthenticated, and silently overwrote the redirect down to the bare `/addresses` list. Fixed by guarding that effect with `!isLoggedIn` too (`client/src/pages/AddressForm.jsx`). Re-verified post-fix.
- [x] Address CRUD, including "set default" actually changing which address pre-selects at checkout — spot-verified manually on 2026-08-19 (add/edit/add-second/set-default/delete all via real UI; checkout correctly pre-selected the new default).
- [x] Order status change (as admin) triggers the expected customer email — spot-verified manually on 2026-08-19: admin status update returns 200 and the customer's Order Details status badge updates correctly; the email send itself is a real unconditional call to Brevo (`server/config/mailer.js` has no dev-mode mock), confirmed attempted but not independently confirmed delivered (avoided burning live send quota on a throwaway test address). **Real feature gap found, not fixed**: the customer-facing Order Details page has no status-history/timeline UI at all — `statusHistory` is returned by the API and rendered in the admin panel, but nowhere on the customer side (`client/src/pages/OrderDetails.jsx` only shows the single current-status badge). Worth a dedicated task if a customer-visible timeline is wanted.

### 3.4 Loyalty & Referral
- [x] Points earned on a delivered order match `orderTotal / earnRate` (rounded down) and appear in the transaction ledger with the correct `balanceAfter` — spot-verified manually on 2026-08-19 (₹699 order → +34 = floor(699/20), ledger entry matched).
- [x] Cancelling a *delivered* order claws back earned points (verify balance decreases, not increases — this was a real historical bug) — spot-verified manually on 2026-08-19 (balance 143→34 on cancellation, `clawback` entry of exactly -109).
- [x] Cancelling a *pending/processing* order refunds only redeemed points, no clawback (nothing was earned yet) — spot-verified manually on 2026-08-19 (only a `refunded` +10 entry, no `clawback` entry created).
- [x] Referral: new signup via a referral link, first order delivered → both referrer and referred get the configured bonus, exactly once (place a second order and confirm no duplicate payout) — spot-verified manually on 2026-08-19 (referrer +100, referred +50+earned on first delivered order; second delivered order for the referred user earned points normally with no duplicate referral bonus).
- [x] Points expiry: a user inactive past the configured period has their balance zeroed on the next scheduled/manual run and receives the expiry email — logic-reviewed, not live-triggered on 2026-08-19 (`expireInactivePoints()` in `server/utils/loyaltyPoints.js` correctly zeroes balance + sends email/notification; the secret-guarded endpoint was confirmed to reject requests without the real `CRON_SECRET`, but not actually fired against local data to avoid mutating it — a real 12-month-inactivity case isn't practically reproducible in one session anyway).

### 3.5 Compare
- [x] Manual compare: add via the card icon, verify the floating bar shows the right count and the `/compare` page, clear all — automated in `e2e/tests/compare-mobile.spec.js`. Removing a single item and the "up to 4 max" limit still need a manual pass.
- [x] Compare bar does not overflow or overlap the WhatsApp/Back-to-top buttons on a narrow (≤375px) viewport — automated, and this is a real regression guard: found and fixed a genuine overlap bug while writing this test (see §1).
- [x] Auto-compare table appears when similar products exist — automated in `e2e/tests/browsing.spec.js`. The "no similar products" absent-case still needs a manual pass.

### 3.6 Marketing Widgets
- [x] Welcome popup: appears for a guest after the delay and auto-closes; does **not** appear for a logged-in visitor — automated in `e2e/tests/marketing-widgets.spec.js`, confirms the earlier same-session fix actually holds in a real browser.
- [x] WhatsApp buttons: site-wide button links to a generic chat; product-page button is pre-filled with the product's name/price and is a genuinely disabled `<button>` (not a clickable link) when out of stock — automated.
- [x] Back-in-stock alert wiring (duplicate-subscription guard, notified flag, in-app notification independent of email success) — automated in `server/tests/back-in-stock.test.js`. Still do one manual pass to confirm the actual email content/delivery in production.
- [x] Abandoned cart targeting logic (stale + not-yet-reminded only) — automated in `server/tests/abandoned-cart.test.js`. Still do one manual pass: add items while logged in, wait past the sync debounce, confirm a `CartSnapshot` exists via `syncCart` — that write path itself isn't covered by the automated test.
- [x] Post-delivery review-request targeting logic (secret guard, only Delivered orders 8+ days old and not yet requested, no re-targeting on a second run) — automated in `server/tests/review-request.test.js` (added 2026-08-24). The cron-job.org job is confirmed set up in production as of 2026-08-25. **Still needed:** one manual pass on the actual email content/delivery, same caveat as back-in-stock above.
- [ ] Order confirmation email on placement (`createOrder`, added 2026-08-24): not yet independently spot-verified for actual delivery — the send call itself follows the same unconditional-Brevo-call pattern as the existing order-status emails (see §3.3), so treat it with the same caveat until confirmed.

### 3.7 Returns & Support Tickets
- [x] Return request: on a delivered order, the Return button appears only on items within their return window (and not at all on a product marked non-returnable); submitting creates a `Requested` return, visible on `/returns` and emails the admin — spot-verified manually on 2026-08-19 via the real Return modal. **Note:** local `SiteSettings.email` is blank, and `notifyAdmin()` in `returnController.js` silently no-ops (no error, no log) when it's unset — worth confirming production actually has this field populated, since nothing would surface the gap if it weren't.
- [x] Return status change (as admin): customer receives an email + bell notification at each step (Approved/Rejected/Picked Up/Refunded). Reaching Picked Up (or jumping straight to Refunded) restores that product's stock exactly once, even if the status is flipped back and forth; reaching Refunded claws back only the returned item's proportional share of loyalty points (not the whole order's), and only if the order was actually delivered/credited — spot-verified manually on 2026-08-19, including explicitly flipping Picked Up → Approved → Picked Up again to confirm stock wasn't double-restored, and re-issuing Refunded twice to confirm the clawback is idempotent. Payment refund is still manual — Razorpay handles checkout/capture (added 2026-08-22) but there is no automated refund-on-return integration.
- [x] Support ticket: raise one (optionally linked to an order via "Get Product Support"), reply as admin (customer gets email + notification), reply as customer on a Resolved/Closed ticket (status auto-reopens to Open) — spot-verified manually on 2026-08-19, including the specific Resolved→customer-reply→Open auto-reopen transition.

### 3.8 Notification Center (Customer)
- [x] Bell only renders when logged in; shows the correct unread count and clears it on "Mark all as read" — automated in `e2e/tests/notifications.spec.js`.
- [x] Clicking an unread notification marks it read, closes the dropdown, and navigates to its `link` — automated.
- [x] `/notifications` full-history page loads independently of the dropdown and reflects the same read/unread state — automated.
- [x] One notification is created per underlying event, not duplicated and not missing, for order status changes and ticket replies — automated in `server/tests/notifications.test.js` (return status and back-in-stock covered separately in `returns.test.js`/`back-in-stock.test.js`). Points expiry is cron-only and still manual.

## 4. Admin Flows

- [x] Login rejects a non-admin account with a clear alert (not a silent failure); admin routes redirect to `/admin/login` for both an unauthenticated visitor and a logged-in non-admin — automated in `e2e/tests/admin.spec.js`.
- [x] All six optional spec fields save and reload correctly through the admin edit form, filled and blank, and the public product page correctly hides the Specifications section once every spec is blank — spot-verified manually via direct `PUT /api/products/:id` calls against local dev (not committed as an automated E2E test: reconstructing the full multipart form for a shared, real, non-disposable product record proved risky to iterate on — a `PUT` missing `isActive`/`featured`/`isTrending` silently defaults them to `false`, which cost real time to notice and fix while testing this locally; documenting that footgun here since it'll bite anyone else scripting against this endpoint too). Image main-selection and video upload are still untested, automated or manual.
- [x] Order status transitions trigger the correct side effects (see §3.4) and the correct customer email per status — spot-verified manually on 2026-08-19: `Order.orderStatus` enum (Pending/Processing/Shipped/Delivered/Cancelled) cross-checked against `ORDER_STATUS_MESSAGES` in `orderController.js` — every status `updateOrderStatus` can actually transition *to* has a matching email/notification case; `Pending` correctly has none since it's only the creation-time default.
- [x] Rewards Settings: change a value, confirm the audit-trail log records old/new value + who + when, and that the *public* `/api/rewards/public` response reflects the new value immediately — spot-verified manually on 2026-08-19 (changed `earnRate` 20→25, `SettingsChangeLog` recorded old/new/who correctly, public endpoint reflected the change on the very next call — no caching layer). Reverted back to 20.
- [x] Site Settings: edit shipping tiers (add/remove a row), confirm Checkout/Cart delivery fee calculations match the new tiers exactly (compare against the server-side `calculateDeliveryFee` for a few subtotal values) — spot-verified manually on 2026-08-19 (added a ₹149→₹25 tier, `/cart` and `/checkout` both showed ₹25 for a ₹120 subtotal, matching the server formula; `CartDrawer` deliberately shows no fee at all, see §3.2). Reverted tiers to the original 5-tier config.
- [x] Bulk product import: a CSV with one intentionally invalid row doesn't silently corrupt the whole batch — spot-verified manually on 2026-08-19. Note: this is client-side only (`AdminBulkImport.jsx` validates each row via PapaParse and only POSTs rows marked "Ready" to the normal `POST /api/products`, no dedicated backend bulk-import route) — 3 valid rows imported, 1 row with an unmatched category was flagged "Category not matched" in the UI and never submitted, not silently skipped or batch-aborted. Test products cleaned up afterward.
- [x] Admin notification bell shows a real new order and clicking it navigates to Orders — automated in `e2e/tests/admin.spec.js`. Coverage of the other five sources (Contact Messages, Reviews, Q&A, Tickets, Returns) and the low/out-of-stock alert item's UI presentation is still manual (the underlying seen/unseen data logic for all of these is exercised server-side across the various `server/tests/*.test.js` files, just not the admin bell UI itself for every source).
- [x] Reports date-range scoping (Total Revenue/Orders, Total Customers staying all-time) — automated in `server/tests/admin-reports.test.js`, direct regression guard for a real historical bug. Still spot-check the *rest* of the report (Top Products, funnel, search analytics, loyalty/referral) manually against a custom range, and that CSV export includes every visible section for the currently selected range — those aren't automated.
- [x] Reports "Points Earned" tile nets out clawback rather than overstating gross issuance — automated in `server/tests/admin-reports.test.js` (added 2026-08-24), direct regression guard for the real historical bug where a delivered-then-cancelled order inflated the figure.
- [x] Order delete/restore/permanent-delete: delete refused on a non-Cancelled order, soft-delete + restore round-trips, permanent delete refused both pre-soft-delete and while a return request/ticket still links to the order, status change refused on a soft-deleted order, non-admin rejected — automated in `server/tests/order.test.js` (added 2026-08-24). Still do one manual pass through the real Admin Orders UI (button states, confirmation prompts) since the automated coverage is API-level only.
- [ ] Manual per-order WhatsApp send button (`AdminOrders.jsx`, added 2026-08-25): opens a `wa.me` deep link in a new tab pre-filled with a message matching the order's current status — not yet covered by any automated test (Playwright can't drive the external `wa.me`/WhatsApp Web hop); needs a manual pass per order status.

## 5. Security & Performance Regression Checks

- [x] CORS (origin allow-list) and standard security headers — automated in `server/tests/security.test.js`.
- [x] Legacy `/uploads/*` images still actually load in the browser from the Vercel-hosted frontend — spot-verified 2026-08-20 via Playwright against the real production homepage: `/uploads/products/bedsheet-2.jpg` and `/uploads/categories/towels.jpg` both returned 200 and rendered (`naturalWidth: 1254`, `complete: true`), not broken images.
- [x] `/api/auth/*` rate limit trips at the configured attempt count — automated in `server/tests/security.test.js`.
- [x] Admin-only JS (Quill editor, admin pages) does not appear in the network tab when browsing the storefront as a logged-out visitor — spot-verified manually on 2026-08-19 against a real production build (`npm run build` + `vite preview`, since dev mode doesn't reflect real code-splitting): all admin page chunks are `Admin*`-prefixed, Quill and PapaParse only load from admin-only pages, and a logged-out browse of home/category/product pages requested zero admin/quill/papaparse chunks.
- [x] MongoDB indexes exist on `Product` and `Order` as documented in `DATABASE.md` — spot-verified manually on 2026-08-19: `Product` matches the doc exactly. **Documentation gap found** (not a functional bug): `Order` actually has 2 more indexes than `DATABASE.md` lists — `{createdAt:-1}` and `{isSeenByAdmin:1,createdAt:-1}` — both already exist correctly in `server/models/Order.js` (backing the admin order list and admin notification poll), `DATABASE.md`'s Order section is just stale relative to the model.

## 6. SEO Regression Checks

- [x] Every page has a unique `<title>` and **exactly one** meta description (Home, a category, a product, an article) — automated in `e2e/tests/seo.spec.js`, and this exact check caught a real duplicate-meta-description bug (see §1).
- [x] Product page structured data includes Product + BreadcrumbList JSON-LD, and the visible breadcrumb trail matches the JSON-LD exactly (same labels, same order) — automated. FAQ schema presence (only relevant when a product has published Q&A) and actually running Google's Rich Results Test still need a manual pass — that's an external tool, not something to fake locally.
- [x] `sitemap.xml` exists and lists product URLs; `robots.txt` disallows account/cart/checkout/admin/search/compare — automated. Confirming *newly added* content appears after a real deploy is still a manual post-deploy spot-check.
