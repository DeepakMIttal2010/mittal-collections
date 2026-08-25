# Database Schema

**Database:** MongoDB (Mongoose ODM)
**Document version:** 1.2
**Last updated:** 2026-08-25

All models live in `server/models/`, one file per collection. All use
Mongoose's `{ timestamps: true }` (adds `createdAt`/`updatedAt`) unless
noted. Fields below list name, type, and notable constraints —
required fields marked **(required)**.

## Core Catalog

### `Product`
| Field | Type | Notes |
|---|---|---|
| name | String | **(required)** |
| slug | String | SEO URL slug |
| description | String | **(required)** |
| price, oldPrice | Number | `oldPrice > price` implies a discount badge |
| category | ObjectId → Category | **(required)** |
| subcategory | ObjectId → Subcategory | nullable |
| image | String | main image URL, **(required)** |
| images | [String] | full gallery |
| videos | [String] | up to 2 |
| stock | Number | |
| fabric, size, gsm, washCare, brand, countryOfOrigin | String | optional specs; each defaults `""` and is only shown on the product page when non-empty |
| rating | Number | 0–5 |
| featured, isTrending, isActive | Boolean | |
| trendingRank | Number | manual sort order within "Trending" |
| isReturnable | Boolean | default `true` |
| returnPeriodDays | Number | default `0` = "use `SiteSettings.defaultReturnPeriodDays`"; a positive value overrides the site-wide window for this product only |
| variants | [{ size, price, oldPrice, stock, purchasePrice }] | optional (added 2026-08-20) — per-size pricing/stock for products sold in multiple sizes at different prices (e.g. Curtains 7x4/9x4). When set, the top-level `price`/`oldPrice` mirror the first variant and top-level `stock` is the sum across variants — both recomputed server-side on every write, never trusted from the client |
| colorVariesNote | String | optional (added 2026-08-19) — when set, shown as a highlighted product-page notice directing customers who want a specific colour to Contact Us first |

**Indexes:** `{isActive, category}`, `{isActive, subcategory}`, `{isActive, createdAt:-1}`.

### `Category` / `Subcategory`
name, slug (both unique), description, image, banner (Category only),
featured, displayOrder, isActive. Subcategory additionally has
`category: ObjectId → Category`.

### `PriceRange`
label, `maxPrice`, `displayOrder`, `isActive` — powers the "Shop by
Price" homepage shortcuts and `/price/:maxPrice`.

### `NewArrivalsSection` (added 2026-08-19)
`{category: ObjectId → Category, displayOrder, isActive}` — admin-CRUD
collection mirroring the `PriceRange` pattern above; controls which
categories get a homepage/`/new-arrivals` New Arrivals section and in
what order. Replaced the earlier `Category.showInHomeNewArrivals`
boolean-flag approach. Per-product inclusion within a section is
separately controlled by `Product.showInNewArrivals`.

### `TrendingSection` (added 2026-08-19)
`{category: ObjectId → Category, displayOrder, isActive}` — same
admin-CRUD pattern, controls which categories get a homepage/`/trending`
Top Trending carousel and in what order. Products within a section are
still selected via the existing `Product.isTrending`/`trendingRank`
fields.

## Users & Access

### `User`
| Field | Type | Notes |
|---|---|---|
| name, email, mobile | String | email + mobile **unique** |
| password | String | bcrypt hash |
| role | String enum | `user` \| `admin` |
| isBlocked | Boolean | |
| loyaltyPoints | Number | live running balance — see `LoyaltyTransaction` |
| referralCode | String | unique, sparse |
| referredBy | ObjectId → User | who referred this user |
| referralRewarded | Boolean | prevents paying the referral bonus twice |
| resetPasswordToken, resetPasswordExpire | String, Date | forgot-password flow |

### `Address`
`user: ObjectId → User` **(required)**, fullName, mobile, address,
unit, city, state, pincode, country (default `"India"`), isDefault.

## Orders & Commerce

### `Order`
| Field | Type | Notes |
|---|---|---|
| user | ObjectId → User | **(required)** |
| orderItems | [{ product, name, image, price, quantity, size }] | denormalized snapshot at order time; `size` (String, default `""`, added 2026-08-20) records which `Product.variants` entry was purchased, if the product has size variants |
| shippingAddress | { fullName, mobile, address, city, state, pincode } | all required |
| paymentMethod | String enum | `COD` \| `Razorpay` |
| totalPrice | Number | **(required)** — final amount actually charged |
| couponCode, discountAmount | String, Number | |
| deliveryFee, codCharge | Number, Number | both **snapshotted at order time**, not re-derived later. `codCharge` (added 2026-08-24) is only set when `paymentMethod === "COD"`, sourced from `SiteSettings.codCharge` (default ₹50 — a placeholder pending real courier COD-handling-fee data from Shiprocket onboarding) |
| bundleDiscountAmount, bundleDiscountPercent, bundleDiscountCategories | Number, Number, [String] | "Complete the Look" bundle-discount snapshot (added 2026-08-20) — rupee amount/percent applied and which category pair qualified, so a later change to `SiteSettings.bundleRules` never rewrites past order totals |
| pointsRedeemed, pointsDiscount, pointsEarned, pointsCredited | Number, Number, Number, Boolean | loyalty accounting for this order |
| razorpayOrderId, razorpayPaymentId | String, String | set only for `paymentMethod: "Razorpay"` orders once `POST /api/orders/verify-payment` confirms the HMAC-SHA256 signature (added 2026-08-22; see `ARCHITECTURE.md` §4.6 — integration currently verified in Razorpay **test mode** only) |
| orderStatus | String enum | `Pending`→`Processing`→`Shipped`→`Delivered`, or `Cancelled` |
| statusHistory | [{ status, changedAt }] | full timeline |
| isPaid, isSeenByAdmin | Boolean | |
| paidAt, deliveredAt | Date | |
| isActive | Boolean | default `true` — soft-delete flag (added 2026-08-24), mirroring `Product`'s existing soft-delete pattern (see `ARCHITECTURE.md` §4.8). Settable `false` only once `orderStatus === "Cancelled"`; a `PUT /api/orders/:id/restore` reverses it, and `updateOrderStatus` refuses to run against a soft-deleted order |
| reviewRequestSent | Boolean | default `false` (added 2026-08-24) — guards the daily review-request cron job (`GET/POST /api/orders/send-review-requests`) so a Delivered order (8+ days old) is never emailed a review request twice |

`Review` and `Question` also carry an `isSeenByAdmin: Boolean` (default
`false`), feeding the same admin notification pattern as `Order`.

**Indexes:** `{user, createdAt:-1}`, `{orderStatus}`, `{"orderItems.product"}` (the last one backs the best-sellers aggregation), `{createdAt:-1}` (admin order list), `{isSeenByAdmin:1, createdAt:-1}` (admin notification poll).

### `Coupon`
code (unique, uppercase), discountType (`percentage`\|`flat`),
discountValue, maxDiscount, firstOrderOnly, description, showAsBanner,
isActive.

### `CartSnapshot`
Server-side mirror of a logged-in user's cart, written by a debounced
client sync — **not** the cart's source of truth (that's
`localStorage`), used only to detect and email abandoned carts.

### `Wishlist`
`{user, product}` pairs. **Unique compound index** `{user, product}`
prevents duplicate entries.

### `StockAlert`
`{product, email}` — a back-in-stock subscription. **Unique compound
index** `{product, email}` prevents duplicate subscriptions.

### `ReturnRequest`
| Field | Type | Notes |
|---|---|---|
| order, user, product | ObjectId | all **(required)** |
| productName, productImage | String | snapshot at request time, survives the product later changing/being deleted |
| quantity | Number | **(required)**, min 1 |
| reason | String | **(required)** |
| status | String enum | `Requested`→`Approved`/`Rejected`→`Picked Up`→`Refunded` |
| adminNote | String | shown to the customer on status-change emails |
| isSeenByAdmin | Boolean | default `false` |
| stockRestored | Boolean | default `false`; flips true the first time status reaches `Picked Up` or `Refunded`, guarding against restoring stock twice |
| pointsClawedBack | Boolean | default `false`; flips true the first time status reaches `Refunded`, guarding against double clawback |

**Indexes:** `{user, createdAt:-1}`, `{status, createdAt:-1}`, `{order, product}`.

### `Ticket`
Embedded message thread in one document (not a separate collection) —
chosen for simplicity given expected support volume.
| Field | Type | Notes |
|---|---|---|
| user | ObjectId → User | **(required)** |
| subject | String | **(required)** |
| order | ObjectId → Order | optional |
| status | String enum | `Open`\|`In Progress`\|`Resolved`\|`Closed` |
| messages | [{sender: `customer`\|`admin`, senderName, message, createdAt}] | full thread |
| lastMessageAt | Date | bumped on every reply, drives admin list sort |
| isSeenByAdmin | Boolean | default `false`; reset to `false` on a customer reply even if previously seen |

**Indexes:** `{user, lastMessageAt:-1}`, `{status, lastMessageAt:-1}`.

### `Notification`
Customer-facing in-app notifications — a lighter companion to the email
sent for the same event, not a replacement for it.
| Field | Type | Notes |
|---|---|---|
| user | ObjectId → User | **(required)** |
| type | String enum | `order_status`\|`ticket_reply`\|`return_status`\|`back_in_stock`\|`loyalty_points` |
| title, message, link | String | `message`/`link` optional |
| isRead | Boolean | default `false` |

**Indexes:** `{user, createdAt:-1}`, `{user, isRead}`.

### `SearchLog`
One row per real search (not per autocomplete keystroke), written
fire-and-forget from `productController.getProducts`.
| Field | Type | Notes |
|---|---|---|
| query | String | **(required)**, lowercased/trimmed |
| resultCount | Number | **(required)**, min 0 |

**Indexes:** `{createdAt:-1}`, `{query}`. No `updatedAt` (`timestamps: {createdAt: true, updatedAt: false}`).

## Loyalty & Referral

### `LoyaltySettings` (singleton — one document, found via `findOne()`)
earnRate (₹ per point, default 20), redeemValue (₹ per point on
redemption, default 1), maxRedeemPercent (default 0.5 = 50% of order),
minRedeemPoints (default 50), expiryMonths (default 12).

### `ReferralSettings` (singleton)
referrerPoints (default 100), referredPoints (default 50) — points
awarded to each side on the referred user's first delivered order.

### `LoyaltyTransaction`
The full ledger. Every balance change is one row here.
| Field | Type | Notes |
|---|---|---|
| user | ObjectId → User | |
| type | String enum | `earned` \| `redeemed` \| `refunded` \| `clawback` \| `referral_bonus` \| `admin_adjustment` \| `expired` |
| points | Number | signed (negative for deductions) |
| balanceAfter | Number | running balance snapshot at the time of this row |
| order | ObjectId → Order | optional, if tied to an order |
| description | String | human-readable reason |

**Index:** `{user, createdAt:-1}`.

### `SettingsChangeLog`
Audit trail for admin-configurable settings changes.
`module` (enum: `loyalty`\|`referral`), `field`, `oldValue`,
`newValue`, `changedBy: {id, name}`.

## Content / CMS

### `Article`
title, slug (unique), excerpt, content (rich-text HTML), coverImage,
isActive.

### `Page`
slug, title, content (rich-text) — used for Shipping Policy, Returns &
Refunds, Privacy Policy, Terms & Conditions.

### `Banner`
image, subtitle, title **(required)**, description, button1Label/Link,
button2Label/Link, displayOrder, isActive — homepage hero carousel
slides.

### `Testimonial`, `FooterLink`
Simple admin-managed content lists (name/quote/rating for testimonials;
label/url/section for footer links), each with `displayOrder` and
`isActive` where applicable.

## Site-Wide Settings

### `SiteSettings` (singleton)
facebook, instagram, twitter, linkedin, address, email, phone,
supportHours, freeShippingThreshold (default 499), deliveryFee
(fallback fee below any tier, default 49), shippingTiers:
`[{maxOrderValue, fee}]` — the graduated fee schedule below the free
threshold, fully admin-editable (add/remove rows in the admin UI).
defaultReturnPeriodDays (default 7) — the site-wide return window used
whenever a product doesn't set its own `returnPeriodDays` override.
codCharge (Number, default 50, added 2026-08-24) — flat fee added to an
order's total when `paymentMethod === "COD"` is selected at checkout;
snapshotted onto `Order.codCharge` at order time (see Orders section
above) rather than re-read from here later.

## Reviews, Questions, Support

### `Review`
product (indexed), user, rating (1–5), comment, isApproved.

### `Question`
product (indexed), user, question, answer, isPublished.

### `ContactMessage`
name, email, message, isRead — from the public Contact form.

### `Subscriber`
email — newsletter list.

## Reference / Analytics

### `State`
Indian states list for address-form dropdowns (seeded via
`npm run seed:states`).

### `PageVisit`
Records each page view (indexed field + `{createdAt:-1}` index) for
internal traffic reporting, independent of GA4.

## Seeding

`server/seeder.js` supports `npm run seed:<categories|products|states|
testimonials|pages|footer-links|banners|price-ranges|coupons|all>` and
`seed:destroy` for resetting reference/demo data during setup.
