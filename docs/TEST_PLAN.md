# Test Plan

**Document version:** 1.2
**Last updated:** 2026-08-08

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

Coverage today (`server/tests/`):
- **Order placement** — stock reserve + atomic rollback on a short item, delivery-fee/total calculation, auth requirement.
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
- [ ] Cart drawer and `/cart` page show matching totals and the correct tiered delivery fee for subtotals just below, just at, and above the free-shipping threshold. (The fee calculation itself is automated in `server/tests/delivery-fee.test.js`; this is a UI-layer check that the client mirrors it correctly.)
- [x] Logged-out checkout redirects to `/login?redirect=/checkout`, and a logged-in customer with items in cart actually reaches the checkout page — automated.
- [ ] Coupon: valid code applies and shows in the UI; expired/invalid code is rejected in the UI. (The backend logic — discount capping, first-order-only eligibility — is covered by `server/tests/coupon.test.js`; this is a UI-layer check that the right message/state shows.)
- [ ] Loyalty point redemption: slider caps correctly at the configured max %, and at the customer's actual balance.
- [ ] Place an order with insufficient stock on one line item — verify the whole order is rejected, the specific item is named, and no stock was deducted from the *other* items in the order (rollback check). (Business logic covered by `server/tests/order.test.js`; not yet driven through the checkout UI end-to-end.)
- [ ] Successful order: cart clears, confirmation shown, order appears in "My Orders", stock is decremented. (Not yet automated end-to-end through the UI — order placement itself is covered server-side.)

### 3.3 Account
- [ ] Every account page (My Orders, Order Details, Loyalty History, Addresses, Add/Edit Address, Change Password, Account, Edit Profile) redirects a logged-out visitor to login and returns them afterward — none should silently show an empty/broken state.
- [ ] Address CRUD, including "set default" actually changing which address pre-selects at checkout.
- [ ] Order status change (as admin) triggers the expected customer email and updates the timeline visible on the customer's Order Details page.

### 3.4 Loyalty & Referral
- [ ] Points earned on a delivered order match `orderTotal / earnRate` (rounded down) and appear in the transaction ledger with the correct `balanceAfter`.
- [ ] Cancelling a *delivered* order claws back earned points (verify balance decreases, not increases — this was a real historical bug).
- [ ] Cancelling a *pending/processing* order refunds only redeemed points, no clawback (nothing was earned yet).
- [ ] Referral: new signup via a referral link, first order delivered → both referrer and referred get the configured bonus, exactly once (place a second order and confirm no duplicate payout).
- [ ] Points expiry: a user inactive past the configured period has their balance zeroed on the next scheduled/manual run and receives the expiry email.

### 3.5 Compare
- [x] Manual compare: add via the card icon, verify the floating bar shows the right count and the `/compare` page, clear all — automated in `e2e/tests/compare-mobile.spec.js`. Removing a single item and the "up to 4 max" limit still need a manual pass.
- [x] Compare bar does not overflow or overlap the WhatsApp/Back-to-top buttons on a narrow (≤375px) viewport — automated, and this is a real regression guard: found and fixed a genuine overlap bug while writing this test (see §1).
- [x] Auto-compare table appears when similar products exist — automated in `e2e/tests/browsing.spec.js`. The "no similar products" absent-case still needs a manual pass.

### 3.6 Marketing Widgets
- [x] Welcome popup: appears for a guest after the delay and auto-closes; does **not** appear for a logged-in visitor — automated in `e2e/tests/marketing-widgets.spec.js`, confirms the earlier same-session fix actually holds in a real browser.
- [x] WhatsApp buttons: site-wide button links to a generic chat; product-page button is pre-filled with the product's name/price and is a genuinely disabled `<button>` (not a clickable link) when out of stock — automated.
- [x] Back-in-stock alert wiring (duplicate-subscription guard, notified flag, in-app notification independent of email success) — automated in `server/tests/back-in-stock.test.js`. Still do one manual pass to confirm the actual email content/delivery in production.
- [x] Abandoned cart targeting logic (stale + not-yet-reminded only) — automated in `server/tests/abandoned-cart.test.js`. Still do one manual pass: add items while logged in, wait past the sync debounce, confirm a `CartSnapshot` exists via `syncCart` — that write path itself isn't covered by the automated test.

### 3.7 Returns & Support Tickets
- [ ] Return request: on a delivered order, the Return button appears only on items within their return window (and not at all on a product marked non-returnable); submitting creates a `Requested` return, visible on `/returns` and emails the admin. (Eligibility logic itself — window calculation, duplicate blocking, non-returnable rejection — is covered by `server/tests/return-eligibility.test.js`; this is a UI-layer check.)
- [ ] Return status change (as admin): customer receives an email + bell notification at each step (Approved/Rejected/Picked Up/Refunded). Reaching Picked Up (or jumping straight to Refunded) restores that product's stock exactly once, even if the status is flipped back and forth; reaching Refunded claws back only the returned item's proportional share of loyalty points (not the whole order's), and only if the order was actually delivered/credited — covered by `server/tests/returns.test.js`. Payment refund is still manual (no Razorpay integration exists yet).
- [ ] Support ticket: raise one (optionally linked to an order via "Get Product Support"), reply as admin (customer gets email + notification), reply as customer on a Resolved/Closed ticket (status auto-reopens to Open).

### 3.8 Notification Center (Customer)
- [x] Bell only renders when logged in; shows the correct unread count and clears it on "Mark all as read" — automated in `e2e/tests/notifications.spec.js`.
- [x] Clicking an unread notification marks it read, closes the dropdown, and navigates to its `link` — automated.
- [x] `/notifications` full-history page loads independently of the dropdown and reflects the same read/unread state — automated.
- [x] One notification is created per underlying event, not duplicated and not missing, for order status changes and ticket replies — automated in `server/tests/notifications.test.js` (return status and back-in-stock covered separately in `returns.test.js`/`back-in-stock.test.js`). Points expiry is cron-only and still manual.

## 4. Admin Flows

- [x] Login rejects a non-admin account with a clear alert (not a silent failure); admin routes redirect to `/admin/login` for both an unauthenticated visitor and a logged-in non-admin — automated in `e2e/tests/admin.spec.js`.
- [x] All six optional spec fields save and reload correctly through the admin edit form, filled and blank, and the public product page correctly hides the Specifications section once every spec is blank — spot-verified manually via direct `PUT /api/products/:id` calls against local dev (not committed as an automated E2E test: reconstructing the full multipart form for a shared, real, non-disposable product record proved risky to iterate on — a `PUT` missing `isActive`/`featured`/`isTrending` silently defaults them to `false`, which cost real time to notice and fix while testing this locally; documenting that footgun here since it'll bite anyone else scripting against this endpoint too). Image main-selection and video upload are still untested, automated or manual.
- [ ] Order status transitions trigger the correct side effects (see §3.4) and the correct customer email per status.
- [ ] Rewards Settings: change a value, confirm the audit-trail log records old/new value + who + when, and that the *public* `/api/rewards/public` response reflects the new value immediately (this is what every "you'll earn N points" preview reads).
- [ ] Site Settings: edit shipping tiers (add/remove a row), confirm Checkout/Cart/Cart Drawer delivery fee calculations match the new tiers exactly (compare against the server-side `calculateDeliveryFee` for a few subtotal values).
- [ ] Bulk product import: a CSV with one intentionally invalid row doesn't silently corrupt the whole batch.
- [x] Admin notification bell shows a real new order and clicking it navigates to Orders — automated in `e2e/tests/admin.spec.js`. Coverage of the other five sources (Contact Messages, Reviews, Q&A, Tickets, Returns) and the low/out-of-stock alert item's UI presentation is still manual (the underlying seen/unseen data logic for all of these is exercised server-side across the various `server/tests/*.test.js` files, just not the admin bell UI itself for every source).
- [x] Reports date-range scoping (Total Revenue/Orders, Total Customers staying all-time) — automated in `server/tests/admin-reports.test.js`, direct regression guard for a real historical bug. Still spot-check the *rest* of the report (Top Products, funnel, search analytics, loyalty/referral) manually against a custom range, and that CSV export includes every visible section for the currently selected range — those aren't automated.

## 5. Security & Performance Regression Checks

- [x] CORS (origin allow-list) and standard security headers — automated in `server/tests/security.test.js`.
- [ ] Legacy `/uploads/*` images still actually load in the browser from the Vercel-hosted frontend — the header being present (automated) doesn't prove the browser accepts it; do one real visual check after any helmet/CORS config change.
- [x] `/api/auth/*` rate limit trips at the configured attempt count — automated in `server/tests/security.test.js`.
- [ ] Admin-only JS (Quill editor, admin pages) does not appear in the network tab when browsing the storefront as a logged-out visitor — verifies the code-splitting boundary hasn't regressed.
- [ ] MongoDB indexes exist on `Product` and `Order` as documented in `DATABASE.md` (`db.collection.getIndexes()`), especially after any schema change.

## 6. SEO Regression Checks

- [x] Every page has a unique `<title>` and **exactly one** meta description (Home, a category, a product, an article) — automated in `e2e/tests/seo.spec.js`, and this exact check caught a real duplicate-meta-description bug (see §1).
- [x] Product page structured data includes Product + BreadcrumbList JSON-LD, and the visible breadcrumb trail matches the JSON-LD exactly (same labels, same order) — automated. FAQ schema presence (only relevant when a product has published Q&A) and actually running Google's Rich Results Test still need a manual pass — that's an external tool, not something to fake locally.
- [x] `sitemap.xml` exists and lists product URLs; `robots.txt` disallows account/cart/checkout/admin/search/compare — automated. Confirming *newly added* content appears after a real deploy is still a manual post-deploy spot-check.
