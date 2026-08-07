# Functional Requirements Specification (FRS)

**Project:** Mittal Collections — Home Furnishing E-commerce Platform
**Live site:** https://www.mittalcollections.com
**Document version:** 1.0
**Last updated:** 2026-08-07

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
- FR-1.5: "Recently Viewed" products are tracked client-side and shown on the homepage and product pages.

### 4.2 Search
- FR-2.1: Header search bar with live autocomplete suggestions (debounced, min 2 characters).
- FR-2.2: Fuzzy/typo-tolerant search (custom Levenshtein-based ranking, no external search service) with category/price filters and sorting on the results page.
- FR-2.3: "No results" fallback suggests categories to browse instead.
- FR-2.4: Voice search input (browser SpeechRecognition API) on the header search bar.

### 4.3 Cart & Checkout
- FR-3.1: Client-side cart (localStorage), usable while logged out; a debounced snapshot syncs to the server for logged-in users (used only for abandoned-cart detection, never read back into the UI).
- FR-3.2: Cart drawer (slide-out) and full `/cart` page, both showing live subtotal, delivery fee, and loyalty-points-earned preview.
- FR-3.3: Delivery fee is tiered: free above an admin-set threshold, and a graduated fee below it (e.g. lower fee as the order value approaches the threshold) — fully admin-configurable, no hardcoded tiers.
- FR-3.4: Checkout requires login (redirects with a `?redirect=` return path). Requires a saved delivery address.
- FR-3.5: Coupon code entry with validation (percentage/flat discount, max discount cap, optional "first order only" restriction); a first-order coupon is auto-suggested if the customer is eligible.
- FR-3.6: Loyalty points redemption slider at checkout (capped at an admin-configured % of order value and a minimum redeemable amount).
- FR-3.7: Payment method: Cash on Delivery or Razorpay (online).
- FR-3.8: Placing an order atomically reserves stock per line item; if any item is out of stock the whole order is rejected with the specific item named, and any already-reserved stock is rolled back.

### 4.4 Orders & Account
- FR-4.1: Customer can view order history ("My Orders"), order detail, and status timeline (Pending → Processing → Shipped → Delivered, or Cancelled).
- FR-4.2: Order status changes trigger an email notification to the customer.
- FR-4.3: Cancelling a delivered order claws back any loyalty points earned from it and refunds any points that were redeemed on it.
- FR-4.4: Account page shows profile summary, loyalty point balance, and referral code/link.
- FR-4.5: Customer can manage saved addresses (add/edit/delete/set default), edit profile, and change password.
- FR-4.6: All account pages (orders, order detail, addresses, loyalty history, profile, change password) redirect a logged-out visitor to `/login?redirect=<page>` instead of showing broken/empty state.

### 4.5 Wishlist & Compare
- FR-5.1: Logged-in customers can add/remove products to a server-persisted wishlist.
- FR-5.2: Any visitor can add up to 4 products to a client-side (localStorage) "Compare" list via an icon on product cards/quick view, see a floating compare bar, and view a side-by-side comparison table at `/compare`.
- FR-5.3: Every product detail page also shows an automatic comparison table against similar products in the same category (no manual selection needed).

### 4.6 Reviews & Questions
- FR-6.1: Customers can submit a star rating + review per product; reviews are shown on the product page (rating average + count feed into the page's Product structured data).
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
- FR-9.4: "Welcome Benefits" popup — shows site-wide benefits (delivery, loyalty, referral, secure payment, returns) once per browser session on site open, and again immediately after login; auto-dismisses after 5 seconds or on manual close.
- FR-9.5: Top banner strip for delivery/service messaging and an active coupon promotion, each independently dismissible for the session.
- FR-9.6: Site-wide floating "WhatsApp Now" button (uses the admin-configured support phone number); product pages additionally get a product-specific "Order on WhatsApp" button (pre-filled with product name/price/link, disabled when out of stock).
- FR-9.7: Newsletter signup + admin-authored campaign emails to all subscribers.

### 4.10 Content Hub (SEO)
- FR-10.1: "Guides & Ideas" articles section (`/articles`) — admin-authored, rich-text, with cover images.
- FR-10.2: Curtain Size Calculator (`/curtain-size-calculator`) — interactive tool converting window measurements + preferences into a recommended rod length, fabric width, curtain length, and closest standard size to buy.
- FR-10.3: Homepage FAQ accordion (site-wide policy questions, sourced from live settings so numbers can't go stale) with FAQPage structured data.

### 4.11 SEO / Technical
- FR-11.1: Unique meta title + description per page (via a shared `Seo` component).
- FR-11.2: Structured data: Product (with AggregateRating), Article, FAQPage, BreadcrumbList, LocalBusiness/HomeGoodsStore (homepage), WebApplication (calculator).
- FR-11.3: Visible breadcrumb trail matching the structured data on category, product, and article pages.
- FR-11.4: SEO-friendly product URLs with slug (`/product/:id/:slug`), backward-compatible with the bare `/product/:id` form.
- FR-11.5: Auto-generated `sitemap.xml` (categories, products, price ranges, articles, static pages) at build time; `robots.txt` excludes account/cart/checkout/admin/search/compare pages.

## 5. Functional Requirements — Admin

### 5.1 Catalog Management
- FR-A1.1: CRUD for Products (images incl. main-image selection, up to 2 videos, price/old price, stock, category/subcategory, featured/trending/active flags, optional specs), Categories, and Subcategories.
- FR-A1.2: Bulk product import via CSV.
- FR-A1.3: Product Q&A moderation (answer/publish) and review moderation (approve).

### 5.2 Orders
- FR-A2.1: View all orders, mark seen, update status (triggers customer email + loyalty point crediting/clawback/referral payout as applicable).

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
- FR-A6.2: Dashboard/reports (orders, revenue, traffic — via `PageVisit`/`VisitTracker` analytics).

### 5.7 Admin Account
- FR-A7.1: Separate admin login (`/admin/login`), profile, change password. All `/admin/*` routes except login are protected (JWT + `role: admin` check) and code-split so no admin-only JS ships to normal storefront visitors.

## 6. Out of Scope (explicitly deferred)

- WhatsApp Business API order notifications (requires Meta business verification — external, multi-day process; email notifications were built instead).
- Automated/AI product recommendations (only rule-based "same category" related products and the auto-compare table exist).
- "Frequently Bought Together" and "Delivery Date Estimator" widgets.
- Product logo/brand redesign work.
- Cloudinary SDK v1 → v2 upgrade (known vulnerability, deliberately held pending a full upload-flow retest).
