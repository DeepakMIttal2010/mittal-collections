# Admin Manual

**Admin login:** https://www.mittalcollections.com/admin/login
**Document version:** 1.0
**Last updated:** 2026-08-07

This guide covers every section of the admin panel
(`/admin/*`). All admin routes require an admin-role login and are
served from separate code chunks — they never load in a regular
customer's browser.

## 1. Logging In

Go to `/admin/login` (not the same login form as customers). After
login you land on the **Dashboard**, which summarizes recent orders,
revenue, and traffic. Your own account settings are under **Profile**
(top-right) — update your name/photo there, and change your admin
password under **Change Password**.

## 2. Products (`/admin/products`)

- **Add Product**: name, description, price/old price, category +
  subcategory, stock, up to several images (pick the main one) and up
  to 2 videos, and optional specs — **Fabric, Size, GSM, Wash Care,
  Brand, Country of Origin**. Leave any spec blank if it doesn't apply
  or you don't have the info yet — the product page only shows the
  specs you actually fill in, and none of them are mandatory to save
  the product.
- Toggle **Featured**, **Active** (inactive = hidden from the
  storefront, not deleted), and **Show in Trending** (with a manual
  rank — lower shows first). Trending is a hand-picked list, separate
  from "Best Sellers" (which is calculated automatically from real
  order data and isn't manually editable).
- **Edit / Delete** from the product list. Delete is a soft delete
  (recoverable) unless you use permanent delete.
- **Bulk Import** (`/admin/products/bulk-import`): upload a CSV to
  create many products at once.

> **Tip:** filling in specs matters more than it looks — it's what
> populates the "Specifications" table and makes the automatic
> "Compare with similar products" table on each product page actually
> useful. Right now most existing products have these left blank.

## 3. Categories & Subcategories

`/admin/categories` and `/admin/subcategories` — name, slug, image,
description, display order, active/inactive. Subcategories are scoped
to a parent category.

## 4. Orders (`/admin/orders`)

View every order, mark it seen, and update its status:
`Pending → Processing → Shipped → Delivered`, or `Cancelled`.

- Moving an order to **Delivered** credits the customer's loyalty
  points for that order (once only) and, if they were referred by
  someone, pays out the referral bonus to both sides on their *first*
  delivered order.
- Moving an order to **Cancelled** refunds any points they redeemed on
  it, and — if it had already been marked Delivered — claws back the
  points they'd earned from it.
- Every status change emails the customer automatically.

## 5. Reviews & Questions (`/admin/reviews`, `/admin/questions`)

Customer reviews and product questions sit here until you approve /
answer them — nothing customer-submitted appears publicly until you
act on it. Answering a question publishes it and it also becomes part
of that product's FAQ rich-result data for Google.

## 6. Marketing & Content

| Section | What it's for |
|---|---|
| **Banners** (`/admin/banners`) | Homepage hero carousel slides — image, headline, subtext, up to 2 buttons, order. |
| **Coupons** (`/admin/coupons`) | Percentage or flat discount codes, optional max-discount cap, optional "first order only", optional "show as promo banner". |
| **Articles** (`/admin/articles`) | "Guides & Ideas" blog posts — rich-text editor, cover image. |
| **Newsletter** (`/admin/newsletter`) | Compose a rich-text email and send it to every subscriber. |
| **Testimonials** (`/admin/testimonials`) | Customer quotes shown on the homepage. |
| **Footer Links** (`/admin/footer-links`) | Manage the footer's link sections. |
| **Price Ranges** (`/admin/price-ranges`) | "Shop by Price" homepage shortcuts. |
| **Pages** (`/admin/pages`) | Edit the Shipping Policy, Returns & Refunds, Privacy Policy, Terms & Conditions content. |
| **Messages** (`/admin/messages`) | Submissions from the public Contact form. |

## 7. Rewards Settings (`/admin/rewards-settings`)

Configure the loyalty and referral programs — no code changes needed
for any of this:

- **Loyalty**: earn rate (₹ spent per point), redeem value (₹ discount
  per point), max redeemable % of an order, minimum points required to
  redeem, and points-expiry period (months of inactivity before a
  balance expires).
- **Referral**: points awarded to the referrer and to the referred
  customer.
- Every change here is logged (old value → new value, who changed it,
  when) in the change history shown on this page — useful if two
  people are editing settings around the same time.

## 8. Site Settings (`/admin/settings`)

- **Contact info**: address, support email/phone/hours, social links
  (shown in the footer and Contact page).
- **Shipping**: default delivery fee, free-shipping threshold, and the
  graduated fee tiers below it (add/remove rows — e.g. "orders under
  ₹99 pay ₹49, under ₹199 pay ₹39" and so on down to free). This is
  what actually gets charged at checkout — the Shipping Policy page
  text should be kept in sync with whatever you set here.

## 9. Customers (`/admin/customers`)

List and search customers, view their order history, block/unblock an
account.

## 10. Reports (`/admin/reports`)

Orders/revenue over time and site traffic, for a higher-level view than
the dashboard summary.

## 11. Things That Run on Their Own (no admin action needed)

- **Abandoned cart emails** — hourly, automatic.
- **Points expiry** — daily, automatic (you can also trigger it
  manually if needed — ask a developer, it's not exposed in the UI).
- **Order status emails**, **welcome emails**, **back-in-stock
  alerts** — automatic on the relevant trigger.
- **Sitemap** — regenerated automatically every time the site is
  deployed, so new products/articles/categories are always included
  for Google.
