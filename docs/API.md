# API Documentation

**Base URL (production):** `https://mittal-collections-api.onrender.com/api`
**Base URL (local):** `http://localhost:5000/api`
**Document version:** 1.0
**Last updated:** 2026-08-07

## Conventions

- All requests/responses are JSON unless uploading files (`multipart/form-data`).
- Every response has at least `{ "success": boolean }`.
- **Auth** column: `Public` = no auth · `User` = requires `Authorization: Bearer <JWT>` of any logged-in user · `Admin` = requires a JWT belonging to a `role: "admin"` user · `Secret` = requires a `?secret=<CRON_SECRET>` query param (used only by the external scheduler, not by the frontend).
- `/api/auth/*` is rate-limited to 20 requests / 15 minutes / IP.

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Create account. Accepts optional `?ref=<referralCode>` handling for referral signups. Sends a welcome email. |
| POST | `/login` | Public | Returns `{ user, token }`. |
| POST | `/forgot-password` | Public | Emails a password-reset link (real email via Brevo, not returned in the API response). |
| POST | `/reset-password` | Public | Consumes the reset token, sets a new password. |
| GET | `/profile` | User | Current user's profile. |
| PUT | `/profile` | User | Update name/mobile. |
| PUT | `/change-password` | User | Requires current password. |

## Products — `/api/products`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | List products. Query params: `search`, `category`, `subcategory`, `minPrice`, `maxPrice`, `sortBy` (`price_asc`/`price_desc`/`newest`). Defaults to `isActive:true`, newest-first. |
| GET | `/trending` | Public | Admin-curated "Trending" list (`?limit=`). |
| GET | `/best-sellers` | Public | Top products ranked by actual units sold from order history, excluding cancelled orders (`?limit=`). |
| GET | `/suggestions` | Public | Autocomplete suggestions (`?q=`). |
| GET | `/:id` | Public | Single product (populated category/subcategory). |
| POST | `/:id/notify` | Public | Subscribe an email for back-in-stock alert on an out-of-stock product. |
| GET | `/admin` | Admin | All products incl. inactive/soft-deleted. |
| POST | `/` | Admin | Create product (`multipart/form-data`: images[], videos[], fields incl. optional specs). |
| PUT | `/:id` | Admin | Update product. |
| PUT | `/:id/restore` | Admin | Restore a soft-deleted product. |
| DELETE | `/:id` | Admin | Soft delete. |
| DELETE | `/:id/permanent` | Admin | Hard delete. |

## Categories — `/api/categories` · Subcategories — `/api/subcategories`

Same CRUD shape as Products (list/admin-list/get/create/update/restore/soft-delete), scoped to `isActive`. Subcategories additionally filter by `?category=<id>`.

## Cart — `/api/cart`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sync` | User | Upserts the logged-in user's server-side cart snapshot (debounced client-side call; used only for abandoned-cart detection, never read back into the cart UI). |
| POST | `/send-abandoned-reminders` | Secret | Scheduled job entry point (hourly). Emails users with a stale, non-empty cart snapshot. |

## Orders — `/api/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | User | Place an order. Body: `orderItems`, `shippingAddress`, `paymentMethod`, optional `couponCode`, `redeemPoints`. Reserves stock atomically; computes delivery fee server-side (never trusts a client-supplied amount). |
| GET | `/myorders` | User | Current user's order history. |
| GET | `/:id` | User | Single order (owner or admin only). |
| GET | `/` | Admin | All orders. |
| PUT | `/:id/status` | Admin | Update status; triggers customer email and loyalty-point crediting/clawback/referral payout side effects. |
| PUT | `/:id/seen` | Admin | Mark as seen in the admin order list. |

## Rewards (Loyalty + Referral) — `/api/rewards`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public` | Public | Current loyalty (`earnRate`, `redeemValue`, `maxRedeemPercent`, `minRedeemPoints`, `expiryMonths`) and referral (`referrerPoints`, `referredPoints`) settings — what every "you'll earn N points" preview is computed from. |
| POST | `/expire-points` | Secret | Scheduled job entry point (daily). Expires the full balance of any user inactive past `expiryMonths`, emails them. |
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
| PUT | `/:id` *(reviews)* / `/:id/seen` | Admin | Approve a review / mark seen. |
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

## States — `/api/states`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Indian states list, for address form dropdowns. |

## Admin — `/api/admin` and `/api/admin/customers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Admin | Summary metrics for the admin home. |
| GET | `/reports` | Admin | Orders/revenue reporting data. |
| GET | `/visits` | Admin | Page-visit analytics log. |
| GET | `/customers`, `/customers/:id` | Admin | Customer list / detail. |
| PUT | `/customers/:id` | Admin | Block/unblock a customer. |
| DELETE | `/customers/:id` | Admin | Delete a customer. |

## Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/visit` | Public | Records a page visit (used by `VisitTracker`, feeds GA4-independent internal analytics). |
| GET | `/product-views/:id` | Public | "N people viewed this today" counter shown on product pages. |

## Static Files

| Path | Description |
|---|---|
| `GET /uploads/*` | Legacy (pre-Cloudinary) images, served directly by Express. |
| `GET /api/health` | Uptime check — `{ success: true, message: "..." }`. |
