# Functional Requirements Specification (FRS)

**Project:** Mittal Collections — Home Furnishing E-commerce Platform
**Live site:** https://www.mittalcollections.com
**Document version:** 1.4
**Last updated:** 2026-09-01

## 1. Purpose

This document describes what the Mittal Collections platform does, from the
perspective of its two users: the **customer** (shopper) and the **admin**
(store owner/staff). It does not describe how the system is built — see
`ARCHITECTURE.md` and `DATABASE.md` for that.

## 2. Scope

Mittal Collections is a full-stack e-commerce site selling home furnishing
products (bedsheets, towels, curtains, pillows, cushions, blankets,
doormats) to customers across India, with Cash on Delivery and online
payment, a loyalty/referral rewards program, and a content hub (guides,
tools) for SEO-driven organic traffic.

## 3. User Roles

| Role | Description |
|---|---|
| **Guest** | Unauthenticated visitor. Can browse, search, view products/articles, use the curtain size calculator. Cannot check out, review, or use rewards. |
| **Customer** | Registered, logged-in user. Full shopping + account functionality. |
| **Admin** | Staff with access to `/admin`. Manages catalog, orders, content, settings. Single role level (no sub-roles/permissions tiers). |

## 4. Functional Requirements — Customer-Facing

### 4.1 Catalog Browsing
- FR-1.1: Browse products by category and subcategory (Doormats, Bedsheets, Towels, Curtains, Pillows, Cushions, Blankets).
- FR-1.2: Filter/sort a category's products (price, name, date, featured).
- FR-1.3: Browse by price range (`/price/:maxPrice`) and by "Trending" (admin-curated) and homepage "New Arrivals" (auto, newest 8).
- FR-1.4: Product detail page shows: image gallery + zoom, video playback, price/discount, stock status, description, optional specs (Fabric, Size, GSM, Wash Care, Brand, Country of Origin — shown only when filled in), loyalty points preview, delivery fee context, reviews, Q&A, related products, and an auto-generated comparison table against similar same-category products.
- FR-1.6: An Amazon-style trust badge row (Pay on Delivery, Return window, Secure Payment, 100% Genuine) sits below the price. The return badge is per-product and real: it reads that product's own `isReturnable`/`returnPeriodDays` (falling back to the site-wide default window), showing "Non-returnable" instead of a fake universal return promise when a product truly isn't returnable.
- FR-1.5: "Recently Viewed" products are tracked client-side and shown on the homepage and product pages.
- FR-1.7: Products may offer multiple size variants (e.g. Curtains sold as 7x4/9x4), each with its own price, old price, and stock. The product page shows an Amazon-style size selector; each size is added to the cart as its own line item (two sizes of the same product can coexist in the cart) and carries through to the order.
- FR-1.8: Homepage sections and a dedicated `/new-arrivals` page group New Arrivals per category (admin-ordered), each with "Show More" pagination; a product can be opted out of New Arrivals individually.
- FR-1.9: Homepage and `/trending` show one Top Trending carousel per admin-selected category (admin controls which categories appear and in what order; per-product inclusion is still via the existing trending flag/rank).
- FR-1.10: A "Clearance Sale" homepage carousel and dedicated `/clearance-sale` page auto-surface any category containing a product discounted 35%+ off MRP, grouped by category and ordered by discount-item count — not admin-curated, so it stays current automatically without maintenance.
- FR-1.11: An optional colour-variation notice may be shown on a product page directing customers who want a specific colour to Contact Us first.
- FR-1.12: An optional "What's Included" line (e.g. "Set of 5 Cushion Covers") is shown as the first row of the specs table when set.
- FR-1.13: A pincode delivery checker on the product page lets a customer enter their pincode and get an immediate answer on whether the area qualifies for 24-hour fast delivery, or standard delivery otherwise, or an "invalid pincode" message. No account required.

### 4.2 Search
- FR-2.1: Header search bar with live autocomplete suggestions (debounced, min 2 characters).
- FR-2.2: Fuzzy/typo-tolerant search (custom Levenshtein-based ranking, no external search service) with category/price filters and sorting on the results page.
- FR-2.3: "No results" fallback suggests categories to browse instead.
- FR-2.4: Voice search input (browser SpeechRecognition API) on the header search bar.
- FR-2.5: An "All ▾" dropdown on the search bar lets a customer scope search to one category before typing; the chosen category carries through the `/search` URL and pre-fills the results-page category filter.
- FR-2.6: Search matches Hindi/Hinglish terms against their English catalog equivalent (e.g. a Hindi/transliterated term for "bedsheet" or "curtain" finds the same results as the English word), not just exact English text.

### 4.3 Cart & Checkout
- FR-3.1: Client-side cart (localStorage), usable while logged out; a debounced snapshot syncs to the server (for logged-in users and, separately, for guests via an anonymous id) — used only for abandoned-cart detection, never read back into the UI. A guest's server-side cart snapshot is folded into their account snapshot the next time they log in.
- FR-3.2: Cart drawer (slide-out) and full `/cart` page, both showing live subtotal, delivery fee, and loyalty-points-earned preview.
- FR-3.3: Delivery fee is tiered: free above an admin-set threshold, and a graduated fee below it (e.g. lower fee as the order value approaches the threshold) — fully admin-configurable, no hardcoded tiers.
- FR-3.4: Checkout requires login (redirects with a `?redirect=` return path). Requires a saved delivery address.
- FR-3.5: Coupon code entry with validation (percentage/flat discount, max discount cap, optional "first order only" restriction); a first-order coupon is auto-suggested if the customer is eligible.
- FR-3.6: Loyalty points redemption slider at checkout (capped at an admin-configured % of order value and a minimum redeemable amount).
- FR-3.7: Payment method: Cash on Delivery or Razorpay (online), selectable via radio button; **Razorpay is the default selection**. Choosing Razorpay opens the Razorpay Standard Checkout modal; the order amount is always computed server-side (never trusted from the client) and the payment signature is verified server-side (HMAC-SHA256) before the order is marked paid. If the customer dismisses or fails the Razorpay payment, the order still exists (Pending/unpaid) and can be paid later from My Orders.
- FR-3.7a: Selecting Cash on Delivery adds an admin-configurable COD handling charge (default ₹50) to the order total, shown as its own line item in the Checkout summary, the customer's Order Details page, and the admin Price Breakdown. The charge is computed server-side only and never applied to Razorpay orders.
- FR-3.8: Placing an order atomically reserves stock per line item; if any item is out of stock the whole order is rejected with the specific item named, and any already-reserved stock is rolled back.
- FR-3.9: "Complete the Look" bundle discount: buying products from two admin-paired categories (e.g. Bedsheets + Cushion Covers) in the same cart automatically unlocks a discount at checkout, no coupon required. Rules (category pair, discount %, active toggle) are admin-editable with no deploy needed. When a cart qualifies for more than one rule, the rule giving the highest rupee discount is applied, and the discount is scoped only to the qualifying items. Cart/Checkout show a click-to-expand breakdown of which items qualified. The same qualifying-category banner also appears on relevant category pages, not just the product detail page.
- FR-3.10: An order confirmation email is sent to the customer immediately on successful order placement (previously the customer heard nothing until an admin changed the order status).

### 4.4 Orders & Account
- FR-4.1: Customer can view order history ("My Orders" — Amazon-style order cards with status headline and per-item actions), order detail, and status timeline (Pending → Processing → Shipped → Delivered, or Cancelled).
- FR-4.2: Order status changes trigger an email notification **and** an in-app notification (see §4.12) to the customer.
- FR-4.3: Cancelling a delivered order claws back any loyalty points earned from it and refunds any points that were redeemed on it.
- FR-4.4: Account page shows profile summary, loyalty point balance, and referral code/link.
- FR-4.5: Customer can manage saved addresses (add/edit/delete/set default), edit profile, and change password.
- FR-4.6: All account pages (orders, order detail, addresses, loyalty history, profile, change password) redirect a logged-out visitor to `/login?redirect=<page>` instead of showing broken/empty state.
- FR-4.7: Header shows a "Deliver to [Name] / [City] [Pincode]" block, sourced from the customer's default saved address when logged in, falling back to an IP-based city guess (and the customer's real name, not "Guest") when logged in without a saved address, or a full IP-based guess for guests. A dropdown of the customer's saved addresses opens directly from this header element for instant switching, not just a link to the full addresses page.
- FR-4.8: Order Details shows a full price breakdown — items, delivery fee, COD charge (if applicable), coupon discount, bundle discount (and which categories triggered it), and loyalty points redeemed — down to the final total. These figures are snapshotted on the order at placement time, so a later change to settings/rules never rewrites the displayed breakdown of a past order.

### 4.4a Returns
- FR-4a.1: From "My Orders", a customer can request a return on an eligible delivered item within its return window (per-product `isReturnable` + `returnPeriodDays`, or the site-wide default), giving a quantity and reason.
- FR-4a.2: A dedicated Returns page (`/returns`) lists all of a customer's return requests and their status: `Requested → Approved/Rejected → Picked Up → Refunded`.
- FR-4a.3: Every return status change emails the customer and posts an in-app notification.

### 4.4b Customer Support (Tickets)
- FR-4b.1: A customer can raise a support ticket (`/tickets`), optionally linked to a specific order (e.g. via "Get Product Support" on an order card), and reply in a message thread (`/tickets/:id`).
- FR-4b.2: Admin replies email the customer and post an in-app notification; a customer reply on a Resolved/Closed ticket automatically reopens it to Open.

### 4.5 Wishlist & Compare
- FR-5.1: Customers can add/remove products to a server-persisted wishlist. Logged-in customers get an account-linked wishlist; a logged-out visitor gets one tracked by an anonymous id, which is automatically folded into their account wishlist the next time they log in (nothing is lost by wishlisting before signing up).
- FR-5.2: Any visitor can add up to 4 products to a client-side (localStorage) "Compare" list via an icon on product cards/quick view, see a floating compare bar, and view a side-by-side comparison table at `/compare`.
- FR-5.3: Every product detail page also shows an automatic comparison table against similar products in the same category (no manual selection needed), with an Add to Cart button per row.
- FR-5.4: A scheduled job emails a logged-in customer whenever a wishlisted product's price drops below whatever price it last alerted for (or the price when added, if never alerted) — so a genuine drop is caught, but the same drop is never re-notified on every subsequent run. Guest wishlist items have no account to email and are skipped.

### 4.6 Reviews & Questions
- FR-6.1: Customers can submit a star rating + review per product, optionally with up to 3 photos and one short video; reviews are shown on the product page (rating average + count feed into the page's Product structured data) and a curated cross-product selection appears in a site-wide showcase. A review tied to a Delivered order earns the reviewer a small loyalty-point bonus once approved, capped per order so multiple reviews from one order can't each claim the full bonus; deleting an approved review claws the points back.
- FR-6.2: Customers can ask a product-specific question; published Q&A pairs are shown publicly and also power FAQPage structured data on that product's page.

### 4.7 Loyalty Points Program
- FR-7.1: Customers earn loyalty points on delivered orders (rate configurable by admin, e.g. 1 point per ₹20 spent).
- FR-7.2: Points can be redeemed at checkout for a discount, capped at an admin-configured percentage of the order and subject to a minimum redemption amount.
- FR-7.3: Full transaction ledger (`/loyalty-history`) shows every earn/redeem/refund/clawback/expiry/referral-bonus event with running balance.
- FR-7.4: Points expire (entire balance) after a configurable period of no earning activity; the customer is emailed when this happens. A scheduled job runs this daily.
- FR-7.5: A points-earned preview ("You'll earn N points") appears on product cards, product detail, cart, cart drawer, and checkout — all computed live from the current earn rate, never hardcoded.

### 4.8 Referral Program
- FR-8.1: Every customer has a unique referral code and shareable link (incl. a one-tap WhatsApp share button).
- FR-8.2: When a referred signup's first order is delivered, both the referrer and the referred customer are awarded a one-time bonus (amounts admin-configurable).

### 4.9 Marketing & Retention
- FR-9.1: Abandoned-cart email reminder — triggered by a scheduled job against the server-side cart snapshot.
- FR-9.2: Back-in-stock email alert — a customer can subscribe on an out-of-stock product; all subscribers are emailed once when stock is replenished.
- FR-9.3: Welcome email on registration.
- FR-9.4: "Welcome Benefits" popup — shows site-wide benefits (delivery, loyalty, referral, secure payment, returns) once per browser session on site open, **guests only**; auto-dismisses after 5 seconds or on manual close. It does not show to a logged-in customer, including right after login — it's a sign-up pitch, not a recurring login greeting.
- FR-9.5: Top banner strip for delivery/service messaging and an active coupon promotion, each independently dismissible for the session.
- FR-9.6: Site-wide floating "WhatsApp Now" button (uses the admin-configured support phone number); product pages additionally get a product-specific "Order on WhatsApp" button (pre-filled with product name/price/link, disabled when out of stock).
- FR-9.7: Newsletter signup + admin-authored campaign emails to all subscribers.
- FR-9.8: A scheduled job emails a customer a post-delivery review request, per item, approximately 8 days after delivery (deliberately past the 7-day return window, so it targets orders the customer has genuinely kept). Each order is only ever emailed once for this, tracked on the order itself.

### 4.10 Content Hub (SEO)
- FR-10.1: "Guides & Ideas" articles section (`/articles`) — admin-authored, rich-text, with cover images. Articles can additionally have a Hindi title/excerpt/body, served at a separate, search-indexable `/hi/articles/:slug` URL.
- FR-10.2: Curtain Size Calculator (`/curtain-size-calculator`) — interactive tool converting window measurements + preferences into a recommended rod length, fabric width, curtain length, and closest standard size to buy.
- FR-10.3: Homepage FAQ accordion (site-wide policy questions, sourced from live settings so numbers can't go stale) with FAQPage structured data.

### 4.11 SEO / Technical
- FR-11.1: Unique meta title + description per page (via a shared `Seo` component).
- FR-11.2: Structured data: Product (with AggregateRating), Article, FAQPage, BreadcrumbList, LocalBusiness/HomeGoodsStore (homepage), WebApplication (calculator).
- FR-11.3: Visible breadcrumb trail matching the structured data on category, product, and article pages.
- FR-11.4: SEO-friendly product URLs with slug (`/product/:id/:slug`), backward-compatible with the bare `/product/:id` form.
- FR-11.5: Auto-generated `sitemap.xml` (categories, products, price ranges, articles, static pages) at build time; `robots.txt` excludes account/cart/checkout/admin/search/compare pages.

### 4.12 Notification Center
- FR-12.1: A bell icon in the site header (logged-in customers only) shows an unread-count badge and a dropdown of recent in-app notifications, polled every 30 seconds; a "View all notifications" link opens the full history at `/notifications`.
- FR-12.2: Notifications fire alongside (not instead of) the existing email for the same event: order status change, support ticket reply, return status change, back-in-stock alert (only for subscribers who have an account), and loyalty points expiry.
- FR-12.3: A customer can mark a single notification read (by clicking it, which also navigates to the relevant page) or mark all as read.

## 5. Functional Requirements — Admin

### 5.1 Catalog Management
- FR-A1.1: CRUD for Products (images incl. main-image selection, up to 2 videos, price/old price, stock, category/subcategory, featured/trending/active flags, optional specs, per-product `isReturnable`/`returnPeriodDays` override), Categories, and Subcategories.
- FR-A1.2: Bulk product import via CSV.
- FR-A1.3: Product Q&A moderation (answer/publish) and review moderation (approve).
- FR-A1.4: Products may be defined with multiple size variants (size, price, old price, stock, purchase price); the top-level price/old-price mirror the first variant and top-level stock is the sum across variants, both recomputed server-side.
- FR-A1.5: "Duplicate Product" action copies name/price/category/stock/specs/cost fields into a new inactive product with no images, then opens its Edit page for the admin to complete.
- FR-A1.6: Products list can be exported to Excel/CSV (with category/subcategory filters, purchase price/misc expenses/total cost, size-wise price/MRP/discount-% and stock for variant products), and a separate "Stock Report" export lists one row per size (stock, restock threshold, will-restock flag, status, stock value) plus a total row.
- FR-A1.7: Purchase-price entry on Add/Edit Product auto-suggests Misc Expenses, MRP, and Price from admin-configured per-category/subcategory pricing rules (falling back to a default 10%/×2/−15% formula); auto-fill never overwrites a field the admin already filled in by hand.
- FR-A1.8: Per-product and bulk QR/print labels (thumbnail, category, MRP struck through, product ID, an internal cost-cipher "product number" decodable only by admin) support an in-store QR/POS sale flow: scanning a label opens a persistent multi-item cart for that sale, and "Complete Sale" records an offline sale, optionally awarding loyalty points if the customer's mobile matches a registered account, and can generate a printed/WhatsApp receipt with an optional discount and payment-proof photo.
- FR-A1.9: A "Share" feature on each product generates a branded 1080x1920 image (photo, name, discounted price, CTA, QR code) or a short branded video (Ken Burns zoom, crossfade transitions, optional background music, discount-badge animation) with an Instagram-style caption, for sharing to WhatsApp/Instagram/Facebook via the native share sheet or clipboard-copy. Sharing is blocked (with an explanation) for offline-only products, since they have no public product link to share.
- FR-A1.10: If two admins have the same product's Edit page open at once, the second one to save gets a conflict error instead of silently overwriting the first admin's changes (optimistic concurrency check).

### 5.2 Orders, Returns & Support
- FR-A2.1: View all orders, mark seen, update status (triggers customer email + loyalty point crediting/clawback/referral payout as applicable). Status can no longer be changed on a deleted (soft-deleted) order.
- FR-A2.1a: An order can be deleted (soft-delete, `isActive: false`) only once it is Cancelled; a deleted order can be restored; a permanent delete is available after that, blocked if a return request or support ticket still references the order.
- FR-A2.1b: Each order has a manual "Send via WhatsApp" button that opens a `wa.me` deep link pre-filled with a message reflecting the order's current status, in a new tab, for the admin to review and send from their own WhatsApp — an interim stand-in while automated WhatsApp order messaging is blocked on Meta Business Verification (see `SRS.md` §1.3).
- FR-A2.2: Manage return requests (`/admin/returns`) — view all, update status through `Requested → Approved/Rejected → Picked Up → Refunded`, with an optional note to the customer on each change. Reaching **Picked Up** (or jumping straight to **Refunded**) automatically restores the returned quantity to that product's stock; reaching **Refunded** automatically claws back the loyalty points earned on that specific item's share of the order (proportional to its price within the order, not the whole order's points), but only if the order was ever delivered/credited in the first place. Both side effects are idempotent — flipping the status back and forth doesn't double-apply them. Actual payment refund is still manual — see §6.
- FR-A2.3: Manage support tickets (`/admin/tickets`) — view all, reply in the message thread, change status (Open/In Progress/Resolved/Closed).

### 5.3 Marketing & Content
- FR-A3.1: Manage homepage banners (hero carousel), testimonials, footer links, price-range shortcuts, coupons.
- FR-A3.2: Articles CMS (create/edit/delete, rich-text body via Quill, cover image upload).
- FR-A3.3: Newsletter composer (rich-text) + send-to-all-subscribers campaign.
- FR-A3.4: Static policy pages (Shipping, Returns, Privacy, Terms) editable as CMS content.

### 5.4 Rewards Configuration
- FR-A4.1: Configure loyalty settings (earn rate, redeem value, max redeem %, min redeem points, expiry period) and referral settings (referrer/referred bonus amounts), each with a full audit-trail change log (old value, new value, who, when).
- FR-A4.2: Manually trigger the points-expiry job; view public rewards info as customers see it.

### 5.5 Site Configuration
- FR-A5.1: Contact info, social links, shipping (base delivery fee, free-shipping threshold, graduated fee tiers — add/edit/remove rows).
- FR-A5.2: View submitted contact-form messages.

### 5.6 Customers & Reporting
- FR-A6.1: Customer list/detail, block/unblock.
- FR-A6.2: Dashboard summary (recent orders, revenue, traffic).
- FR-A6.3: Reports page (`/admin/reports`) — date range selectable via 7/30/90-day presets or a custom start/end date; every metric is scoped consistently to the selected range (with one deliberate exception: "Total Customers" is shown all-time). Includes: revenue/orders with period-over-period growth %, sales & visits trend charts, a conversion funnel (Visitors → Product Viewers → Cart Viewers → Checkout Viewers → Orders Placed, explicitly labeled as approximate since visits are tracked by an anonymous ID not linked to accounts), top/zero-result search queries, a live (not date-scoped) cart-abandonment snapshot, orders by status, top pages, device breakdown, top-selling products, revenue by category, visitor locations, and loyalty/referral performance (points earned/redeemed/expired with redemption rate, referral signups/conversions/bonus paid out — "Points Earned" nets out clawback, i.e. points reversed when a delivered order is later cancelled, so it reflects genuinely retained points rather than gross issuance). The whole report exports to a single multi-section CSV. Total Sales/Revenue figures site-wide (dashboard and Reports) exclude Cancelled orders.
- FR-A6.4: A Product Engagement table on the Reports page — per-product views, current wishlist count, and current cart count, with its own date-range control (All time/Today/Yesterday/Custom, scoping only the Views figure). Each number drills down into who — including guest visitors, shown as "Guest (not logged in)" alongside named customers — and the exact date and time, exportable to CSV per-product or for the whole table.
- FR-A6.4: A "Google Analytics & Search Console" section on the same Reports page, showing live data pulled server-side via a Google service account: Active Users, Sessions, Page Views, Engagement Rate, and Top Pages from GA4; Clicks, Impressions, CTR, Average Position, and Top Search Queries from Search Console. Only supports the 7/30/90-day presets (not the custom date picker); shows a quiet "unavailable" message rather than an error if the service account isn't configured.

### 5.7 Notification Bell (Admin)
- FR-A7.1: A bell icon in the admin header shows an unread-count badge and dropdown covering: new orders, contact messages, reviews, Q&A, support tickets, and return requests — each clickable, marking that item seen and navigating to it.
- FR-A7.2: A live (non-dismissible) low-stock / out-of-stock alert item appears in the same feed whenever any product is at or below the low-stock threshold or at zero — it isn't a "seen" event, it just stops appearing once restocked.

### 5.8 Admin Account
- FR-A8.1: Separate admin login (`/admin/login`), profile, change password. All `/admin/*` routes except login are protected (JWT + `role: admin` check) and code-split so no admin-only JS ships to normal storefront visitors.

## 6. Out of Scope (explicitly deferred)

- Automated WhatsApp Business API order notifications (e.g. order confirmation/status updates sent automatically) — blocked on Meta Business Verification, which requires a business-name-matching document not yet available. The Cloud API **webhook** (receiving) is live and verified; there is no message-**sending** integration yet. A manual per-order `wa.me` deep-link button (FR-A2.1b) and the pre-existing POS-receipt/product-share WhatsApp links stand in for this in the meantime.
- Automated/AI product recommendations (only rule-based "same category" related products and the auto-compare table exist).
- "Frequently Bought Together" and "Delivery Date Estimator" widgets.
- Product logo/brand redesign work.
- Razorpay refund automation — a refund still has to be issued manually via the Razorpay dashboard; only payment capture (order creation + signature verification) is automated.
- Push notifications (web push/FCM) and SMS/WhatsApp-API notifications — only email + the in-app Notification Center exist.
- Per-variant stock is now supported for products explicitly modeled with size variants (FR-A1.4); products without variants still track a single `stock` number for the whole product. No stock-change audit log, no supplier/reorder/purchase-order concept.
