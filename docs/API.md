# API Documentation

**Base URL (production):** `https://mittal-collections-api.onrender.com/api`
**Base URL (local):** `http://localhost:5000/api`
**Document version:** 1.3
**Last updated:** 2026-09-01

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
| GET | `/new-arrivals` | Public | Flat New Arrivals list (not category-grouped) — used where a single ranked list is needed rather than the homepage's per-category carousels below. |
| GET | `/new-arrivals-by-category` | Public | Category-grouped New Arrivals for the homepage sections and the `/new-arrivals` page, driven by the admin-managed `NewArrivalsSection` ordering (see `/api/new-arrivals-sections`); replaces the earlier `Category.showInHomeNewArrivals` flag approach. Products can opt out individually via `Product.showInNewArrivals`. New 2026-08-19. |
| GET | `/big-savings` | Public | Products with the largest discount off `oldPrice`, for a "Big Savings" homepage/landing section. |
| GET | `/suggestions` | Public | Autocomplete suggestions (`?q=`). Matches Hindi/Hinglish search terms as well as English. |
| GET | `/:id` | Public | Single product (populated category/subcategory). Response may include `variants[]` (size/price/oldPrice/stock) for products sold in multiple sizes — see note below. |
| GET | `/:id/admin` | Admin | Single product incl. inactive/soft-deleted and internal cost fields, for the admin Edit Product screen. |
| POST | `/:id/notify` | Public | Subscribe an email for back-in-stock alert on an out-of-stock product. |
| GET | `/admin` | Admin | All products incl. inactive/soft-deleted. |
| GET | `/decode-number` | Admin | Decodes a printed price-label's internal cost-cipher "product number" back to purchase month/year/price — used by the QR/print-label workflow. New 2026-08-10. |
| POST | `/` | Admin | Create product (`multipart/form-data`: images[], videos[], fields incl. optional specs, `isReturnable`, `returnPeriodDays`, optional `variants[]`). `image` is no longer schema-required (supports the transient state created by Duplicate below). |
| POST | `/:id/duplicate` | Admin | Duplicates a product — copies name/price/category/stock/specs/cost fields into a new **inactive** product with no images — and returns its id so the admin can jump straight to its Edit page. New 2026-08-11. |
| PUT | `/:id` | Admin | Update product. Rejects the write with a conflict error if the product was edited by someone else since the client last loaded it (optimistic concurrency via Mongoose's `__v`, see note below) instead of silently overwriting the other admin's changes. |
| PUT | `/:id/restore` | Admin | Restore a soft-deleted product. |
| DELETE | `/:id` | Admin | Soft delete. |
| DELETE | `/:id/permanent` | Admin | Hard delete. Now also cleans up the Cloudinary asset (best-effort) and dangling `Wishlist`/`StockAlert`/`Review` references, in addition to the pre-existing `Order` reference guard, and is blocked by an `OfflineSale` reference too. |

**Size variants (added 2026-08-20):** `Product.variants` is an optional array of `{ size, price, oldPrice, stock, purchasePrice }` for products sold at multiple sizes/prices (e.g. Curtains at 7x4 vs 9x4). When present, the top-level `price`/`oldPrice` mirror the first variant and top-level `stock` is the sum across variants — both recomputed server-side and never trusted from the client. Each size becomes its own cart line and is carried through to the order as `orderItems[].size`. `purchasePrice`/`miscExpenses`/`purchaseDate` (top-level and inside `variants[]`) are internal cost fields and are always stripped from public API responses.

**Concurrent-edit protection:** `Product` has Mongoose's `optimisticConcurrency` enabled — two admins opening the same product's Edit page and both saving no longer results in a silent last-write-wins data loss; the second `PUT /:id` fails with a conflict instead of quietly reverting the first admin's fields.

**Stock edits — `stockBaseline` (added 2026-10-28):** orders, POS sales, cancellations and returns change stock with an atomic `$inc`, which doesn't bump `__v`, so the version check above can't see them. The admin Edit page therefore also sends `stockBaseline` — the stock it showed when it loaded — as a top-level field and on each loaded `variants[]` row whose size wasn't renamed. `PUT /:id` applies only the change (`stock − stockBaseline`) to the stock as it is at save time, inside a MongoDB transaction (a sale landing mid-save makes the save retry on fresh stock); a change that would take stock below zero is rejected with 409 and nothing is written. Without `stockBaseline` (a newly added or renamed size, older clients, scripts) the legacy behaviour stays: the sent stock is written as-is, so a script that adjusts stock should send `stockBaseline` too. Because the save needs a transaction, a standalone mongod without a replica set gets 503 unless `ALLOW_NON_TRANSACTIONAL_ORDER_WRITES=true` (local only, never in production — see DEPLOYMENT.md).

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
| POST | `/sync-guest` | Public | Same snapshot upsert as `/sync`, keyed by an anonymous `visitorId` instead of a logged-in user — lets guest carts also feed abandoned-cart detection. |
| POST | `/merge-guest` | User | Called once right after login to fold a just-logged-in customer's guest cart snapshot into their account's. |
| POST | `/send-abandoned-reminders` | Secret | Scheduled job entry point (hourly). Emails users with a stale, non-empty cart snapshot. Accepts `GET` too as of 2026-08-13 (cron-job.org defaults new jobs to GET; this endpoint was POST-only and had likely 404'd on every scheduled run since inception until fixed). |

## Orders — `/api/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Place an order. Body: `orderItems` (each optionally carrying `size` for variant products), `shippingAddress`, `paymentMethod` (`"COD"` or `"Razorpay"` — **defaults to Razorpay in the checkout UI** as of 2026-08-24, previously COD), optional `couponCode`, `redeemPoints`. Reserves stock atomically; computes delivery fee, `codCharge` (COD orders only, from `SiteSettings.codCharge`), and bundle-discount amount server-side — all snapshotted onto the order at creation time, never trusted from the client and never re-derived later. If any item has `Product.localDeliveryOnly: true`, resolves `shippingAddress.pincode` against the delivery-area check and rejects the whole order (400) if it falls outside the nearby fast-delivery zone — enforced here too, not just as a client-side checkout warning (added 2026-09-17). For `paymentMethod: "Razorpay"`, also creates a Razorpay order server-side from the computed total and returns the Razorpay order id for the frontend to open the checkout modal. Sends an order-confirmation email immediately on placement (added 2026-08-24 — previously customers heard nothing until an admin changed the status). |
| POST | `/verify-payment` | User | Verifies a Razorpay payment signature (HMAC-SHA256) and marks the order paid. Body: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. New 2026-08-22. |
| POST / GET | `/send-review-requests` | Secret | Daily scheduled job for the three review-collection emails (`server/utils/reviewEmails.js`), all measured from `deliveredAt` on Delivered, non-deleted orders: **Day 1** delivery-feedback email (24–72 h after delivery, only while no feedback answer exists), **Day 8** review request (8–30 days), **Day 14** one reminder (14–30 days, only after a request was sent, at least 6 days after it). Nothing goes out more than 30 days after delivery. Request and reminder list only items the customer kept (returns other than Rejected are excluded, matched per product + size + quantity) and has not reviewed yet. Customers with `reminderEmailsOptOut` or no email are skipped. Each email is claimed once in `Order.reviewNotices` and never re-sent; see the delivery rule below. `dryRun` (query or body; `dryRun`/`dry_run`/`dry-run`, any value except `0`/`false`) only reads: no claim, no email, no opt-out token, and the response lists masked order ids. Response: `{ dryRun, feedback, request, reminder }`, each `{ candidates, eligible, sent, failed, gaveUp, skipped: { reason: count } }`, plus the legacy Day-8 fields `sent`, `total`, `skippedNoEligibleItems`. 401 without a valid secret. Registered before `/:id` so it isn't shadowed by it. New 2026-08-24; three emails since PR #398. |
| POST | `/:id/delivery-feedback` | User (order owner) | "Did you receive your product safely?" Body `{ response: "yes" }` or `{ response: "no", message }` (`message` 10–1000 characters). Open for 30 days from delivery (`deliveredAt`, or the Delivered `statusHistory` entry). One answer per order; a "yes" may be changed to "no" once, within the same window. A "no" opens one support ticket (`source: "delivery_feedback"`) and emails the admin. 201 → `{ deliveryFeedback, deliveryFeedbackInfo, ticketId? }`. Errors (with `code`): 400 `INVALID_RESPONSE` / `INVALID_MESSAGE`, 403 `NOT_DELIVERED` / `FEEDBACK_WINDOW_CLOSED`, 404 `ORDER_NOT_FOUND` (also for someone else's order), 409 `ALREADY_SUBMITTED`, 503 `TEMPORARILY_UNAVAILABLE`. Rate-limited to 15 requests / minute. |
| GET | `/myorders` | User | Current user's order history. |
| GET | `/:id` | User | Single order (owner or admin only). Response now includes the full snapshotted price breakdown (delivery fee, coupon discount, bundle discount + which categories triggered it, loyalty points redeemed, `codCharge`) and `statusHistory` timestamps, surfaced on the customer Order Details page as a status stepper since 2026-08-20. Also returns `deliveryFeedbackInfo`: `{ eligible, canSubmit, canReportIssue, deadline, reason }` (`reason`: `not_delivered` / `already_submitted` / `window_closed` / `null`). |
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
| PUT | `/:id/status` | Admin | Update status (`Requested`/`Approved`/`Rejected`/`Picked Up`/`Refunded`) + optional `adminNote`. Emails the customer and posts an in-app notification. On `Refunded`, once refunded returns cover every unit of that product on the order, a paid review bonus for it is reversed in the same transaction (a partial return keeps it). |
| PUT | `/:id/seen` | Admin | Mark as seen in the admin notification feed. |

## Support Tickets — `/api/tickets`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Create a ticket (`subject`, `message`, optional `order`). |
| GET | `/my` | User | Current user's tickets. |
| GET | `/:id` | User | Single ticket with full message thread (owner or admin only). |
| POST | `/:id/messages` | User | Reply in the thread. Admin reply → emails customer + notification, flips status Resolved/Closed → Open on a customer reply. |
| GET | `/admin` | Admin | All tickets. Each carries `source` (`customer` or `delivery_feedback`). |
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
| GET | `/public` | Public | Current loyalty (`earnRate`, `redeemValue`, `maxRedeemPercent`, `pointsValidityDays`; `minRedeemPoints` always 0, kept for old clients) and referral (`referrerPoints`, `referredPoints`) settings — what every "you'll earn N points" preview is computed from. |
| POST | `/expire-points` | Secret | Scheduled loyalty job (daily or more often; safe to overlap). Credits delivered orders whose return window has closed (plus a referral bonus on a referred customer's first kept order), then expires batches past their 365 days and notifies once per customer. Accepts `GET` too as of 2026-08-13 (same fix as the abandoned-cart-reminders endpoint — see Cart section above). |
| GET | `/my-transactions` | User | Paginated loyalty ledger for the current user (max 100 per page; admin identity, keys and lot allocations omitted). |
| GET | `/my-summary` | User | Available (spendable) vs pending points, each batch with its expiry date, points owed, lifetime totals. |
| GET | `/admin` | Admin | Loyalty + referral settings plus the audit-trail change log. |
| PUT | `/admin/loyalty` | Admin | Update loyalty settings (logs each changed field). |
| PUT | `/admin/referral` | Admin | Update referral settings (logs each changed field). |

## Wishlist — `/api/wishlist`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | User | Current user's wishlist. |
| POST | `/` | User | Add a product. |
| DELETE | `/:productId` | User | Remove one product. |
| DELETE | `/` | User | Clear entire wishlist. |
| GET | `/guest/:visitorId` | Public | Guest wishlist, keyed by an anonymous `visitorId` instead of a logged-in user. |
| POST | `/guest` | Public | Add a product to a guest wishlist. |
| DELETE | `/guest/:visitorId/:productId` | Public | Remove one product from a guest wishlist. |
| DELETE | `/guest/:visitorId` | Public | Clear a guest wishlist entirely. |
| POST | `/merge-guest` | User | Called once right after login to fold a just-logged-in customer's guest wishlist into their account's. |
| POST / GET | `/send-price-drop-alerts` | Secret | Scheduled job entry point. Emails logged-in users (guest wishlist items are skipped — no email to send to) whenever a wishlisted product's price has dropped below whatever price it last alerted for (or the price when added, if never alerted), so the same drop is never re-notified on every run. Accepts `GET` too, same cron-job.org compatibility reason as the abandoned-cart-reminders endpoint. |

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
| GET | `/product/:productId` | Public | Approved (and not hidden) reviews / published Q&A for a product, with rating average / count. Reviews are capped at 500 and serialized through the public allowlist below. |
| GET | `/showcase` *(reviews only)* | Public | The 12 newest approved, not hidden reviews that have photos **and** `photoConsent: true`, each with a minimal `product` (`_id`, `name`, `slug`, `image`), for the homepage customer-photo gallery. |
| GET | `/eligibility/:productId` *(reviews only)* | User | `{ eligible, hasPurchased, alreadyReviewed }` — lets the product page show the review form only to a customer whose submission would be accepted. Not the gate itself; `POST /` repeats the check. |
| POST | `/` | User | Submit a review or question (pending admin moderation). Reviews accept `multipart/form-data` (`productId`, `rating` whole 1–5, `content` max 2000, optional `title`, up to 3 `images`, one `video` max 20 s, `photoConsent`). **Verified buyers only:** the customer must have a non-deleted order with this product that reached Delivered (`deliveredAt`, a Delivered `statusHistory` entry or current status); a later return or post-delivery cancellation doesn't remove that. The check (`validateReviewSubmission`) runs before any media is uploaded. Errors: 400 missing/invalid fields, 400 already reviewed, 403 `NOT_ELIGIBLE`, 400 `PHOTO_CONSENT_REQUIRED` (photos/video sent without `photoConsent` = `true`/`1`/`on`). 201 returns only `{ _id, rating, title, content, isApproved, createdAt, photoConsent }` — no order/user ids, points or moderation fields. Rate-limited to 30 uploads / minute. |
| GET | `/admin` | Admin | All reviews/questions incl. unmoderated. Reviews: needs the `reviews` permission, includes `bonusReversal` and `bonusHold`, capped at 2000; the response adds `total` (real count for the filter) and `truncated` (`true` when the cap cut the list). |
| PUT | `/:id/answer` *(questions only)* | Admin | Answer + publish a question. |
| PUT | `/:id/approve` *(reviews)* / `/:id/answer` *(questions)* / `/:id/seen` | Admin | Approve a review / answer+publish a question / mark seen. Approving a **hidden** review is refused with 409 ("Unhide it before approving"), with nothing changed and no points. Approval pays the review bonus (see below); when it is held, the response carries `bonusHold: { reason }`. |
| POST | `/:id/reverse-bonus` *(reviews only)* | Admin (`reviews` + `loyalty`) | Take back a paid bonus from a fake/fraudulent review. Body `{ reason }` (10–1000 characters, required), optional `evidence` (max 2000). The bonus's own batch is debited first; points already spent become owed (`User.loyaltyPointsOwed`, no negative balance); an already-expired part is neither debited nor owed. The order's cap stays used. The review itself is left as it is. 200 → `{ message, bonusReversal }`. 400 bad reason/evidence or no bonus paid, 404, 409 already reversed or points changed mid-reversal (retry). |
| POST | `/:id/grant-bonus` *(reviews only)* | Admin (`reviews` + `loyalty`) | Pay a bonus that was held at approval, once the hold no longer applies (e.g. return rejected). Re-checks eligibility inside the transaction and pays through the same path as approval (same cap, same ledger key). 200 → `{ message, pointsAwarded }` (0 when the order's cap is already used). 400 not approved yet, 404, 409 already processed, 409 `BONUS_STILL_HELD` with `bonusHold: { reason }`. |
| DELETE | `/:id` | Admin | Delete. For reviews, also removes the review's Cloudinary image/video assets and claws back a paid bonus in the same transaction (same expired-part and owed rules as reverse-bonus; skipped if already reversed). The review's share of the order's cap is **not** freed. |
| GET | `/admin/summary` *(reviews only)* | Admin | Store-wide totals: `total`, `byStatus` (approved/pending), `hidden`, `public`, `averageRating`, `publicAverageRating`, `rewarded` and `nonRewarded` (`{ count, averageRating }`), `reversed` (count). Averages are `null` for an empty group. Independent of list filters. |
| PUT | `/:id/hide` · `/:id/unhide` *(reviews only)* | Admin | Hide (body `{ reason }`, required, max 500) / unhide. A hidden review is left out of every public list, count and average; loyalty points are never touched. |
| PUT · DELETE | `/:id/reply` *(reviews only)* | Admin | Set/edit (body `{ text }`, required, max 1000, plain text) / remove the public "Reply from Mittal Collections". Editing keeps the original `repliedAt`. |

`GET /api/reviews/admin` (reviews) also takes optional filters: `status` (`pending`/`approved`), `visibility` (`hidden`/`visible`), `rating` (`1`-`5`), `hasPhotos` (`true`/`false`), `rewarded` (`true` = paid and not reversed, `reversed`, `false`), `from` / `to` (`YYYY-MM-DD`, IST, inclusive), `sortOrder` (`asc` = oldest first; any other value, a repeated value, or none = newest first — it is never rejected). An unknown or repeated value for any of the other filters is a 400.

**Public review shape** (`server/utils/publicReview.js`, used by `/product/:productId` and `/showcase`): an explicit allowlist — `_id`, `rating`, `title`, `content`, `images` / `video` (only when `photoConsent` is true, else empty), `createdAt`, `user: { name }` with a **short name** built on the server ("Deepak Kumar Mittal" → "Deepak M.", a name that looks like an email/phone/URL or is empty → "Customer"), `verifiedPurchase` (review linked to an order), `rewarded` (bonus paid, yes/no only), and `adminReply` (`text`, `repliedAt`, `updatedAt`, never the admin). No user/order ids, points or moderation fields. The product page and the bot render no longer emit review JSON-LD (`aggregateRating` / `review`), because reviews are incentivised.

**Review bonus rules** (`server/utils/reviewBonus.js`): 50 points per approved review, capped at 50 per order across all its reviews; paid only for a verified review whose customer still keeps at least one unit of the product on that order. Otherwise approval sets `bonusHold.reason` (`return_in_progress`, `returned`, `order_cancelled`, `order_deleted`) and pays nothing, using none of the cap. Re-approving never pays a held bonus — it only refreshes the reason (`return_rejected` once the item is kept again); only `grant-bonus` releases it. A partial return keeps the bonus. A paid bonus is reversed automatically (system reversal, ledger source `review_bonus_reversal`) when refunds cover every unit of the product, the order is cancelled, or the order is soft-deleted. Known limitation (code comment at the grant re-check): a return created at the same instant as a grant is not seen and the bonus can be paid; the automatic reversal on full refund takes it back.

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
| POST | `/` | Admin | Create (rich-text `content`, cover image upload). Optional `titleHi`/`excerptHi`/`contentHi` fields power the Hindi version of the article, served client-side at `/hi/articles/:slug` (same underlying document and API route — no separate Hindi endpoint). |
| PUT | `/:id` | Admin | Update. |
| DELETE | `/:id` | Admin | Delete. |
| POST | `/upload-image` | Admin | Upload a single image for use inside the rich-text editor body (separate from the cover image sent with create/update). |

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

**Product Engagement report** (added 2026-08-26, `/api/admin/product-engagement*`):

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/product-engagement` | Admin | Per-product views/wishlist-count/cart-count, one row per product. Views default to all-time; wishlist/cart counts are always a current-state snapshot (how many people have it right now), never date-filtered. Optional `startDate`+`endDate` scopes the views figure to a range. |
| GET | `/product-engagement/:productId/wishlist-users` | Admin | Who currently has this product wishlisted — name/email/mobile + when added, including guest entries (shown as "Guest (not logged in)", no contact details). |
| GET | `/product-engagement/:productId/cart-users` | Admin | Who currently has this product in their cart — same shape as wishlist-users, "last synced" date instead of "added on" (a cart snapshot only tracks one `updatedAt` for the whole cart, not per line item). |
| GET | `/product-engagement/:productId/view-users` | Admin | Who viewed this product — logged-in and guest visitors alike, one row per visitor (guests as "Guest (not logged in)"), each with the last time they viewed it. Optional `startDate`+`endDate`, same as the parent report. |
| GET | `/product-engagement/details` | Admin | Flat CSV-export-friendly row list combining every current wishlist + cart entry across all products in one response (`product`, `type`, `name`, `mobile`, `email`, `date` per row). |
| GET | `/abandoned-carts` | Admin | Every currently-abandoned cart snapshot (3-hour-inactive cutoff) with its items, value, and whether a reminder email has already gone out. |

## Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/visit` | Public | Records a page visit (used by `VisitTracker`, feeds GA4-independent internal analytics). |
| GET | `/product-views/:id` | Public | "N people viewed this today" counter shown on product pages. |
| GET | `/my-location` | Public | IP-based city/region/country guess for the requesting visitor — the fallback source for the header's "Deliver to" block when a customer isn't logged in or has no saved address. |

## Delivery — `/api/delivery`

New 2026-09-01. Server-side proxy for India Post's free public pincode-lookup API, which has no CORS headers and so can't be called directly from the browser.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check-pincode/:pincode` | Public | Validates the pincode is 6 digits, looks it up via India Post, and matches the returned post-office name(s)/district against the site's own delivery-area list (`server/utils/deliveryAreas.js`, mirrored in `client/src/utils/deliveryAreas.js` — no hardcoded pincode-to-area table to keep in sync by hand). Response: `{ success, found, fastDelivery, areaName, district }` (or `{ success, found: false }` for an unrecognized pincode). |

## Product Feed — `/api/feed`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/google.xml` | Public | RSS 2.0 + Google Shopping namespace XML feed of every active, publicly-visible product (`visibility` other than `"offline"`), for Google Merchant Center / Meta Commerce Manager to fetch directly. Includes `g:sale_price` when a product is discounted and `ships_from_country=IN`. Also emits `<g:color>`, `<g:material>` (from `Product.fabric`), and `<g:pattern>` when those fields are set on the product — only included when non-empty, since Merchant Center flags an empty tag as invalid (added 2026-09-16/17). New 2026-08-12. |

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
