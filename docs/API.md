# API Documentation

**Base URL (production):** `https://mittal-collections-api.onrender.com/api`
**Base URL (local):** `http://localhost:5000/api`
**Document version:** 1.2
**Last updated:** 2026-08-25

## Conventions

- All requests/responses are JSON unless uploading files (`multipart/form-data`).
- Every response has at least `{ "success": boolean }`.
- **Auth** column: `Public` = no auth · `User` = requires `Authorization: Bearer <JWT>` of any logged-in user · `Admin` = requires a JWT belonging to a `role: "admin"` user · `Secret` = requires a `?secret=<CRON_SECRET>` query param (used only by the external scheduler, not by the frontend). The WhatsApp webhook routes are a fourth, one-off case — see that section.
- `/api/auth/*` is rate-limited to 20 requests / 15 minutes / IP.

## Auth — `/api/auth`

Registration is a **2-step OTP flow** (changed 2026-08-08) — `POST /register` no longer creates the account by itself.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Step 1 of 2: validates registration details and emails a 6-digit OTP (10-minute expiry, 5 attempts). Does **not** create the User document yet — pending state is held in a TTL-backed `Otp` document. Accepts optional `?ref=<referralCode>` for referral signups. |
| POST | `/register/verify-otp` | Public | Step 2 of 2: confirms the OTP, creates the User document (`emailVerified: true`), sends the welcome email, returns `{ user, token }`. |
| POST | `/google` | Public | Verifies a Google ID token server-side (`google-auth-library`, needs `GOOGLE_OAUTH_CLIENT_ID` — see `DEPLOYMENT.md`). Signs in an existing account, links Google to an existing email/password account by matching email, or creates a new account. Returns `{ user, token }`. |
| POST | `/login` | Public | Returns `{ user, token }`. |
| POST | `/forgot-password` | Public | Emails a password-reset link (real email via Brevo, not returned in the API response). |
| POST | `/reset-password` | Public | Consumes the reset token, sets a new password. |
| GET | `/profile` | User | Current user's profile. |
| PUT | `/profile` | User | Update name/mobile. |
| PUT | `/change-password` | User | Requires current password. |

## Products — `/api/products`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | List products. Query params: `search`, `category`, `subcategory`, `minPrice`, `maxPrice`, `sortBy` (`price_asc`/`price_desc`/`newest`), `limit`. Defaults to `isActive:true`, newest-first. `limit` now actually caps the result count (fixed 2026-08-20 — was previously accepted but silently ignored). |
| GET | `/trending` | Public | Admin-curated "Trending" list (`?limit=`). |
| GET | `/trending-by-category` | Public | Category-grouped Top Trending carousels for the homepage and `/trending` page — one carousel per category enabled via the admin-managed `TrendingSection` ordering (see `/api/trending-sections`); per-product inclusion within a category still comes from `isTrending`/`trendingRank`. New 2026-08-19. |
| GET | `/best-sellers` | Public | Top products ranked by actual units sold from order history, excluding cancelled orders (`?limit=`). |
| GET | `/new-arrivals-by-category` | Public | Category-grouped New Arrivals for the homepage sections and the `/new-arrivals` page, driven by the admin-managed `NewArrivalsSection` ordering (see `/api/new-arrivals-sections`); replaces the earlier `Category.showInHomeNewArrivals` flag approach. Products can opt out individually via `Product.showInNewArrivals`. New 2026-08-19. |
| GET | `/suggestions` | Public | Autocomplete suggestions (`?q=`). |
| GET | `/:id` | Public | Single product (populated category/subcategory). Response may include `variants[]` (size/price/oldPrice/stock) for products sold in multiple sizes — see note below. |
| POST | `/:id/notify` | Public | Subscribe an email for back-in-stock alert on an out-of-stock product. |
| GET | `/admin` | Admin | All products incl. inactive/soft-deleted. |
| GET | `/decode-number` | Admin | Decodes a printed price-label's internal cost-cipher "product number" back to purchase month/year/price — used by the QR/print-label workflow. New 2026-08-10. |
| POST | `/` | Admin | Create product (`multipart/form-data`: images[], videos[], fields incl. optional specs, `isReturnable`, `returnPeriodDays`, optional `variants[]`). `image` is no longer schema-required (supports the transient state created by Duplicate below). |
| POST | `/:id/duplicate` | Admin | Duplicates a product — copies name/price/category/stock/specs/cost fields into a new **inactive** product with no images — and returns its id so the admin can jump straight to its Edit page. New 2026-08-11. |
| PUT | `/:id` | Admin | Update product. |
| PUT | `/:id/restore` | Admin | Restore a soft-deleted product. |
| DELETE | `/:id` | Admin | Soft delete. |
| DELETE | `/:id/permanent` | Admin | Hard delete. Now also cleans up the Cloudinary asset (best-effort) and dangling `Wishlist`/`StockAlert`/`Review` references, in addition to the pre-existing `Order` reference guard, and is blocked by an `OfflineSale` reference too. |

**Size variants (added 2026-08-20):** `Product.variants` is an optional array of `{ size, price, oldPrice, stock, purchasePrice }` for products sold at multiple sizes/prices (e.g. Curtains at 7x4 vs 9x4). When present, the top-level `price`/`oldPrice` mirror the first variant and top-level `stock` is the sum across variants — both recomputed server-side and never trusted from the client. Each size becomes its own cart line and is carried through to the order as `orderItems[].size`. `purchasePrice`/`miscExpenses`/`purchaseDate` (top-level and inside `variants[]`) are internal cost fields and are always stripped from public API responses.

## Categories — `/api/categories` · Subcategories — `/api/subcategories`

Same CRUD shape as Products (list/admin-list/get/create/update/restore/soft-delete), scoped to `isActive`. Subcategories additionally filter by `?category=<id>`.

## POS / In-Store Sales — `/api/admin/pos`

New 2026-08-10, admin-only (`authMiddleware` + `adminMiddleware`) on every route. Powers the QR-code-triggered in-store sale flow: printed product labels link to `/admin/pos/:id`, which opens a persistent (localStorage-backed) POS cart that can hold multiple different products in one transaction before "Complete Sale". Records are stored separately from `Order` in a new `OfflineSale` collection — see `docs/DATABASE.md`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/product/:id` | Admin | Fetch a product for the POS sale screen. |
| GET | `/customer` | Admin | Look up a customer by mobile number, so loyalty points can be awarded if it matches a registered account. |
| POST | `/sale` | Admin | Record an offline sale (`multipart/form-data`, optional `paymentProof` file). Body includes `items[]` (multi-product cart: product, quantity, unit price), `discountAmount`, `paymentMethod` (`Cash`/`UPI`/`Card`), `customerMobile`, `customerName`. Awards loyalty points when the mobile matches a registered account and snapshots `soldByMobile`. |
| GET | `/sales` | Admin | List offline sales. |

## Cart — `/api/cart`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sync` | User | Upserts the logged-in user's server-side cart snapshot (debounced client-side call; used only for abandoned-cart detection, never read back into the cart UI). |
| POST | `/send-abandoned-reminders` | Secret | Scheduled job entry point (hourly). Emails users with a stale, non-empty cart snapshot. Accepts `GET` too as of 2026-08-13 (cron-job.org defaults new jobs to GET; this endpoint was POST-only and had likely 404'd on every scheduled run since inception until fixed). |

## Orders — `/api/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Place an order. Body: `orderItems` (each optionally carrying `size` for variant products), `shippingAddress`, `paymentMethod` (`"COD"` or `"Razorpay"` — **defaults to Razorpay in the checkout UI** as of 2026-08-24, previously COD), optional `couponCode`, `redeemPoints`. Reserves stock atomically; computes delivery fee, `codCharge` (COD orders only, from `SiteSettings.codCharge`), and bundle-discount amount server-side — all snapshotted onto the order at creation time, never trusted from the client and never re-derived later. For `paymentMethod: "Razorpay"`, also creates a Razorpay order server-side from the computed total and returns the Razorpay order id for the frontend to open the checkout modal. Sends an order-confirmation email immediately on placement (added 2026-08-24 — previously customers heard nothing until an admin changed the status). |
| POST | `/verify-payment` | User | Verifies a Razorpay payment signature (HMAC-SHA256) and marks the order paid. Body: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. New 2026-08-22. |
| POST / GET | `/send-review-requests` | Secret | Scheduled job entry point. Finds Delivered orders 8+ days past delivery (past the 7-day return window, signalling genuine "kept it" intent — tuned from an initial 4 days) that haven't been emailed yet, sends one review-request email per order, and sets `reviewRequestSent` so it's never re-sent. Registered before `/:id` so it isn't shadowed by it. New 2026-08-24. |
| GET | `/myorders` | User | Current user's order history. |
| GET | `/:id` | User | Single order (owner or admin only). Response now includes the full snapshotted price breakdown (delivery fee, coupon discount, bundle discount + which categories triggered it, loyalty points redeemed, `codCharge`) and `statusHistory` timestamps, surfaced on the customer Order Details page as a status stepper since 2026-08-20. |
| GET | `/` | Admin | All orders. |
| PUT | `/:id/status` | Admin | Update status; triggers customer email and loyalty-point crediting/clawback/referral payout side effects. Refuses to run on a soft-deleted order (`isActive: false`) as of 2026-08-24. |
| PUT | `/:id/seen` | Admin | Mark as seen in the admin order list. |
| PUT | `/:id/restore` | Admin | Restores a soft-deleted order. New 2026-08-24. |
| DELETE | `/:id` | Admin | Soft delete (`isActive: false`) — only allowed once `orderStatus === "Cancelled"`. New 2026-08-24. |
| DELETE | `/:id/permanent` | Admin | Hard delete — blocked if a `ReturnRequest` or `Ticket` still references the order. New 2026-08-24. |

## Returns — `/api/returns`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Create a return request for a delivered order item (`orderId`, `productId`, `quantity`, `reason`). Emails the admin. |
| GET | `/my` | User | Current user's return requests. |
| GET | `/admin` | Admin | All return requests (`?status=` filter). |
| PUT | `/:id/status` | Admin | Update status (`Requested`/`Approved`/`Rejected`/`Picked Up`/`Refunded`) + optional `adminNote`. Emails the customer and posts an in-app notification. |
| PUT | `/:id/seen` | Admin | Mark as seen in the admin notification feed. |

## Support Tickets — `/api/tickets`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Create a ticket (`subject`, `message`, optional `order`). |
| GET | `/my` | User | Current user's tickets. |
| GET | `/:id` | User | Single ticket with full message thread (owner or admin only). |
| POST | `/:id/messages` | User | Reply in the thread. Admin reply → emails customer + notification, flips status Resolved/Closed → Open on a customer reply. |
| GET | `/admin` | Admin | All tickets. |
| PUT | `/:id/status` | Admin | Update status (Open/In Progress/Resolved/Closed). |
| PUT | `/:id/seen` | Admin | Mark as seen in the admin notification feed. |

## Notifications (Customer) — `/api/notifications` (all routes require User auth)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Most recent 30 notifications + `unreadCount` for the current user. |
| PUT | `/:id/read` | Mark one notification read. |
| PUT | `/mark-all-read` | Mark all of the current user's notifications read. |

## Rewards (Loyalty + Referral) — `/api/rewards`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public` | Public | Current loyalty (`earnRate`, `redeemValue`, `maxRedeemPercent`, `minRedeemPoints`, `expiryMonths`) and referral (`referrerPoints`, `referredPoints`) settings — what every "you'll earn N points" preview is computed from. |
| POST | `/expire-points` | Secret | Scheduled job entry point (daily). Expires the full balance of any user inactive past `expiryMonths`, emails them. Accepts `GET` too as of 2026-08-13 (same fix as the abandoned-cart-reminders endpoint — see Cart section above). |
| GET | `/my-transactions` | User | Paginated loyalty ledger for the current user. |
| GET | `/admin` | Admin | Loyalty + referral settings plus the audit-trail change log. |
| PUT | `/admin/loyalty` | Admin | Update loyalty settings (logs each changed field). |
| PUT | `/admin/referral` | Admin | Update referral settings (logs each changed field). |

## Wishlist — `/api/wishlist` (all routes require User auth)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Current user's wishlist. |
| POST | `/` | Add a product. |
| DELETE | `/:productId` | Remove one product. |
| DELETE | `/` | Clear entire wishlist. |

## Addresses — `/api/addresses` (all routes require User auth)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List saved addresses. |
| POST | `/` | Add address. |
| PUT | `/:id` | Update address. |
| PUT | `/:id/default` | Set as default. |
| DELETE | `/:id` | Delete. |

## Reviews — `/api/reviews` · Questions — `/api/questions`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/product/:productId` | Public | Approved reviews / published Q&A for a product, with rating average / count. |
| POST | `/` | User | Submit a review or question (pending admin moderation). |
| GET | `/admin` | Admin | All reviews/questions incl. unmoderated. |
| PUT | `/:id/answer` *(questions only)* | Admin | Answer + publish a question. |
| PUT | `/:id/approve` *(reviews)* / `/:id/answer` *(questions)* / `/:id/seen` | Admin | Approve a review / answer+publish a question / mark seen. |
| DELETE | `/:id` | Admin | Delete. |

## Coupons — `/api/coupons`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/banner` | Public | The currently active "show as banner" coupon, if any. |
| GET | `/first-order-offer` | User | The first-order coupon, if the user is eligible. |
| POST | `/validate` | User | Validate a code against the current cart subtotal; returns discount amount. |
| GET | `/admin` | Admin | All coupons. |
| POST / PUT | `/` / `/:id` | Admin | Create / update. |
| PUT | `/:id/restore` | Admin | Restore soft-deleted. |
| DELETE | `/:id` | Admin | Soft delete. |

## Articles (Guides CMS) — `/api/articles`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Published articles list. |
| GET | `/slug/:slug` | Public | Single article by slug. |
| GET | `/admin`, `/admin/:id` | Admin | Admin list / single (incl. unpublished). |
| POST | `/` | Admin | Create (rich-text `content`, cover image upload). |
| PUT | `/:id` | Admin | Update. |
| DELETE | `/:id` | Admin | Delete. |

## Site Settings — `/api/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Contact info, social links, `freeShippingThreshold`, `deliveryFee` (fallback), `shippingTiers[]`. |
| PUT | `/` | Admin | Update any subset of the above. |

## Content/Marketing Admin Resources

All of the following follow the same pattern — `GET /` (public list where relevant) and an `Admin`-only CRUD set:

| Resource | Base path | Notes |
|---|---|---|
| Banners (homepage hero) | `/api/banners` | Image + title/subtitle/description + up to 2 CTA buttons, `displayOrder`. |
| Testimonials | `/api/testimonials` | |
| Footer Links | `/api/footer-links` | |
| Price Ranges | `/api/price-ranges` | Powers "Shop by Price" homepage shortcuts. |
| Static Pages | `/api/pages` | Shipping/Returns/Privacy/Terms — CMS content by `slug`. |
| Newsletter | `/api/newsletter` | `POST /subscribe` (public), `GET /admin` (subscriber list), `POST /send` (campaign to all subscribers). |
| Contact | `/api/contact` | `POST /` (public submit), admin list/read/delete. |
| New Arrivals Sections *(new 2026-08-19)* | `/api/new-arrivals-sections` | `{category, displayOrder, isActive}` — admin-only ordering of which categories get a homepage New Arrivals section. **No public list route** — the storefront reads sections indirectly via `GET /api/products/new-arrivals-by-category`. |
| Trending Sections *(new 2026-08-19)* | `/api/trending-sections` | `{category, displayOrder, isActive}` — admin-only ordering of which categories get a Top Trending carousel. Same no-public-route note as above; storefront reads via `GET /api/products/trending-by-category`. |

## States — `/api/states`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Indian states list, for address form dropdowns. |

## Admin — `/api/admin` and `/api/admin/customers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Admin | Summary metrics for the admin home. |
| GET | `/notifications` | Admin | Recent unseen items across Orders, Contact Messages, Reviews, Q&A, Tickets, Return Requests, plus a live low/out-of-stock alert item (not a "seen" event — it just disappears once restocked). Returns per-source counts and `totalUnread`. |
| PUT | `/notifications/mark-all-read` | Admin | Marks every unseen item (Orders/Messages/Reviews/Questions/Tickets/Returns) seen in one call; the stock alert is unaffected since it isn't a dismissible event. |
| GET | `/reports` | Admin | Orders/revenue/traffic/loyalty reporting data. Query params: `days` (7/30/90, default 30) **or** `startDate`+`endDate` (custom range, takes priority over `days`). Response includes `summary`, `growth` (revenue/orders % vs. the equal-length prior period, `null` when there's nothing to compare against), `funnel`, `cartAbandonment` (live snapshot, not range-scoped), `search` (top/zero-result queries), `loyalty` (points earned/redeemed/expired, redemption rate, referral signups/conversions/points paid), plus the original sales/visits/products/category/location breakdowns. |
| GET | `/reports/google` | Admin | Live GA4 + Search Console data via a Google service account (`GOOGLE_SERVICE_ACCOUNT_KEY` env var). Query param: `days` (7-90, default 28). Response: `analytics` (activeUsers, sessions, pageViews, engagementRate, topPages) and `searchConsole` (clicks, impressions, ctr, avgPosition, topQueries). Only supports the preset day ranges, not a custom start/end. Returns 502 with a quiet error message if the service account isn't configured or hasn't been granted access — see `DEPLOYMENT.md`. |
| GET | `/visits` | Admin | Page-visit analytics log. |
| GET | `/customers`, `/customers/:id` | Admin | Customer list / detail. |
| PUT | `/customers/:id` | Admin | Block/unblock a customer. |
| DELETE | `/customers/:id` | Admin | Delete a customer. |

## Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/visit` | Public | Records a page visit (used by `VisitTracker`, feeds GA4-independent internal analytics). |
| GET | `/product-views/:id` | Public | "N people viewed this today" counter shown on product pages. |
| GET | `/my-location` | Public | IP-based city/region/country guess for the requesting visitor — the fallback source for the header's "Deliver to" block when a customer isn't logged in or has no saved address. |

## Product Feed — `/api/feed`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/google.xml` | Public | RSS 2.0 + Google Shopping namespace XML feed of every active, publicly-visible product (`visibility` other than `"offline"`), for Google Merchant Center / Meta Commerce Manager to fetch directly. Includes `g:sale_price` when a product is discounted and `ships_from_country=IN`. New 2026-08-12. |

## WhatsApp — `/api/whatsapp`

New 2026-08-25. Currently **receive-only** — there is no message-*sending* endpoint in this codebase yet (blocked on Meta Business Verification; see `DEPLOYMENT.md` §4.8). Neither route uses JWT auth or the `CRON_SECRET` pattern — they're gated by Meta's own verify-token/webhook mechanism instead, since the caller is Meta's servers, not a logged-in session or the scheduler.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/webhook` | Public, verify-token gated | Meta dashboard Callback URL verification step. Echoes back `hub.challenge` only when the request's `hub.verify_token` matches the `WHATSAPP_VERIFY_TOKEN` env var. |
| POST | `/webhook` | Public, no signature check yet | Receives message-status/incoming-message events from Meta. Acknowledges immediately regardless of payload content (Meta disables webhooks that respond slowly). Payload signature verification is **not yet implemented**. |

Two manual `wa.me` deep-link stand-ins exist elsewhere in the app (not API endpoints — client-side only): a per-order "Send WhatsApp Update" button in the admin Orders list (pre-fills a status-based message for the admin to send manually, added 2026-08-25) and a "Send Bill on WhatsApp" button on POS receipts.

## Static Files

| Path | Description |
|---|---|
| `GET /uploads/*` | Legacy (pre-Cloudinary) images, served directly by Express. 30-day immutable cache headers added 2026-08-20. |
| `GET /api/health` | Uptime check — `{ success: true, message: "..." }`. |
