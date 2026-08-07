# Test Plan

**Document version:** 1.0
**Last updated:** 2026-08-07

## 1. Testing Approach

There is no automated test suite (no Jest/Vitest/Playwright configured)
— quality is currently maintained through manual testing before every
deploy: a local build/lint pass, direct API smoke tests via `curl`
against both local and production, and manual verification in-browser
for anything UI/visual. This document is the manual regression
checklist that should be run before/after any significant change,
organized by flow. Adding an automated suite (at minimum: API
integration tests for order placement and loyalty points, since those
have the most interlocking business logic) is a reasonable future
investment, not yet done.

## 2. Pre-Deploy Sanity Checks (every change)

- [ ] `npm run build` (client) completes with no errors.
- [ ] `npx eslint src` (client) shows no *new* errors versus the baseline.
- [ ] Backend starts cleanly (`node server.js`) with no console errors, and connects to MongoDB.
- [ ] `curl` the endpoints touched by the change (both local and, after deploy, production) and check status codes + response shape.

## 3. Customer Flows

### 3.1 Browsing & Search
- [ ] Category page loads products, filters/sorts work, empty category shows a friendly "no products" state (not a crash).
- [ ] Search returns relevant results for an exact term, a misspelled term, and a term with no matches (verify the "no results" category suggestions appear).
- [ ] Autocomplete suggestions appear after 2+ characters and navigate correctly on click.
- [ ] Product detail page: gallery/zoom, video playback (if present), stock status, specs section (present only when the product has at least one spec filled in, absent otherwise), reviews, Q&A, related products, and the auto-compare table all render without errors on a product **with** related products and one **without** (e.g. an uncategorized or singleton-category product).

### 3.2 Cart & Checkout
- [ ] Add to cart from: product card, quick view, product detail page. Quantity respects available stock.
- [ ] Cart drawer and `/cart` page show matching totals and the correct tiered delivery fee for subtotals just below, just at, and above the free-shipping threshold.
- [ ] Logged-out checkout redirects to `/login?redirect=/checkout` and returns to checkout after login.
- [ ] Coupon: valid code, expired/invalid code, first-order-only code as a repeat customer (should be rejected).
- [ ] Loyalty point redemption: slider caps correctly at the configured max %, and at the customer's actual balance.
- [ ] Place an order with insufficient stock on one line item — verify the whole order is rejected, the specific item is named, and no stock was deducted from the *other* items in the order (rollback check).
- [ ] Successful order: cart clears, confirmation shown, order appears in "My Orders", stock is decremented.

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
- [ ] Manual compare: add up to 4 products via the card/quick-view icon, verify the floating bar and `/compare` page, remove one, clear all.
- [ ] Compare bar does not overflow or overlap the WhatsApp/Back-to-top buttons on a narrow (≤375px) viewport.
- [ ] Auto-compare table on a product page appears when similar products exist (even with zero specs filled in — Price/Rating alone should still render the table) and is absent when the product's category has no other active products.

### 3.6 Marketing Widgets
- [ ] Welcome popup: appears once per session on site open (after the delay), and again immediately on login even within the same session; auto-fades after ~5s or on manual close.
- [ ] WhatsApp buttons: site-wide button opens a generic chat; product-page button is pre-filled with that product's name/price/link and is disabled (not clickable) when the product is out of stock.
- [ ] Back-in-stock: subscribe on an out-of-stock product, restock it (as admin), confirm the subscriber receives an email and isn't double-subscribed on repeat sign-up.
- [ ] Abandoned cart: add items while logged in, wait past the sync debounce, confirm a `CartSnapshot` exists; verify the reminder job only targets genuinely stale/non-empty carts (don't need to wait a full hour in dev — can trigger the endpoint directly with the cron secret).

## 4. Admin Flows

- [ ] Login rejects a non-admin account; admin routes 401/redirect for an unauthenticated request.
- [ ] Product add/edit: image main-selection, video upload, all six optional spec fields save and reload correctly (including saving as blank).
- [ ] Order status transitions trigger the correct side effects (see §3.4) and the correct customer email per status.
- [ ] Rewards Settings: change a value, confirm the audit-trail log records old/new value + who + when, and that the *public* `/api/rewards/public` response reflects the new value immediately (this is what every "you'll earn N points" preview reads).
- [ ] Site Settings: edit shipping tiers (add/remove a row), confirm Checkout/Cart/Cart Drawer delivery fee calculations match the new tiers exactly (compare against the server-side `calculateDeliveryFee` for a few subtotal values).
- [ ] Bulk product import: a CSV with one intentionally invalid row doesn't silently corrupt the whole batch.

## 5. Security & Performance Regression Checks

- [ ] CORS: a request with `Origin: https://www.mittalcollections.com` gets `Access-Control-Allow-Origin` back; a request with an arbitrary origin does not.
- [ ] Security headers present (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`) on API responses.
- [ ] Legacy `/uploads/*` images still load in the browser from the Vercel-hosted frontend (cross-origin) — this specifically broke once during helmet setup and was fixed via `crossOriginResourcePolicy: "cross-origin"`; don't regress it.
- [ ] `/api/auth/login` rate limit trips after the configured attempt count and returns a clear error, not a silent hang.
- [ ] Admin-only JS (Quill editor, admin pages) does not appear in the network tab when browsing the storefront as a logged-out visitor — verifies the code-splitting boundary hasn't regressed.
- [ ] MongoDB indexes exist on `Product` and `Order` as documented in `DATABASE.md` (`db.collection.getIndexes()`), especially after any schema change.

## 6. SEO Regression Checks

- [ ] Every page has a unique `<title>` and meta description (spot-check Home, a category, a product, an article).
- [ ] Structured data on a product page validates (Product + Breadcrumb + FAQ if the product has Q&A) — use Google's Rich Results Test.
- [ ] Visible breadcrumb trail matches the breadcrumb JSON-LD exactly (same labels, same order).
- [ ] `sitemap.xml` includes newly added products/articles/categories after a deploy.
- [ ] `robots.txt` still disallows account/cart/checkout/admin/search/compare paths.
