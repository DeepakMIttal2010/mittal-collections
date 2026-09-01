# Admin Manual

**Admin login:** https://www.mittalcollections.com/admin/login
**Document version:** 1.4
**Last updated:** 2026-09-01

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

The bell icon in the top bar shows unseen activity across the whole
store — new orders, contact messages, reviews, Q&A, support tickets,
and return requests — plus a live low/out-of-stock alert whenever any
product needs restocking. Click any item to open it (marking it seen)
or **Mark all as read** to clear the rest; the stock alert isn't a
"seen" event, it stays until the product is actually restocked.

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
- **Returnable** toggle + **Return period (days)**: leave the period
  at 0 to use the site-wide default (set under Site Settings); set a
  specific number of days to override it for just this product, or
  switch Returnable off to show "Non-returnable" on the product page
  instead of a return badge.
- **Sizes / Variants**: for products sold in more than one size at
  different prices (e.g. Curtains as 7x4 or 9x4), add size variants
  instead of a single price/stock. Each size gets its own price, old
  price, stock, and purchase price; the product page shows an
  Amazon-style size picker and each size adds to the cart as its own
  line. Leave this off for products that only come one way.
- **Purchase Price**: enter this and Misc. Expenses / MRP / Price
  auto-suggest based on category (and subcategory, if a rule exists
  for it) — see **Pricing Rules** under Site Settings. It only fills
  in fields you haven't already typed a value into by hand, so
  overriding a suggestion is safe.
- **What's Included**: a short line (e.g. "Set of 5 Cushion Covers")
  shown as the first row of the specs table — use it whenever the
  product is sold as a set so customers don't have to guess the count
  from photos.
- **Colour Varies Note**: optional; when filled in, shows a highlighted
  notice on the product page telling customers who want a specific
  colour to contact you first before ordering.
- **Show in New Arrivals**: on by default; switch off to keep a
  specific product out of the homepage/`/new-arrivals` New Arrivals
  sections even while the category itself is featured there.
- **Will Restock**: on by default. Switch off for a discontinued item
  that's sold out — instead of showing "Notify Me" it disappears from
  the storefront (listings, search, New Arrivals, Best Sellers)
  entirely once stock hits zero.
- **Restock Alert**: leave off to use the site-wide low-stock
  threshold (5 units), or switch on and set your own quantity for
  products you want an earlier or later warning on.
- **Visibility**: **Both** (default), **Online only**, or **Offline
  only**. Set a product to Offline to sell it only through in-store QR
  sales (see §2b) while hiding it from the public website entirely —
  listings, search, Trending, Best Sellers, the product page, and the
  Google/Meta product feed all skip it. An offline-only product also
  can't be shared via the Share button (§2a).
- **Edit / Delete** from the product list. Delete is a soft delete
  (recoverable) unless you use permanent delete.
- **Duplicate**: copies a product's name, price, category, stock,
  specs, and cost fields into a new (inactive, imageless) product and
  jumps straight to its Edit page — a quick starting point for a
  near-identical product instead of filling the form from scratch.
- **Show columns**: on the product list, check which extra columns you
  want visible (Featured, Returnable, Trending, Restock Alert, Will
  Restock) — most are also sortable by clicking the column header.
  Category and Subcategory filters, once set, are remembered for the
  rest of your session until you click **Reset Filters**.
- **Bulk Import** (`/admin/products/bulk-import`): upload a CSV to
  create many products at once.
- **Export to Excel**: downloads the current (filtered) product list,
  including size-wise Price/MRP/Discount%/Stock columns for products
  with variants, plus cost columns (Purchase Price, Misc. Expenses,
  Total Cost).
- **Stock Report**: a separate export, one row per size, with Stock,
  Restock Alert Threshold, Will Restock, Status, Show Product,
  Purchase Price, and Stock Value per row, plus a TOTAL row at the
  bottom — the quickest way to get a stock-valuation snapshot.
- **Print QR Labels** (`/admin/products/print-labels`): generate and
  print a QR/price label per product (or in bulk, filtered by
  category/subcategory/stock/purchase date/name) — thumbnail, name
  (wraps to 2 lines), MRP struck through, price, and product ID.
  Scanning the QR code opens that product's in-store sale screen (see
  §2b). Each label also carries a small printed "product number" that
  only decodes back to purchase month/year/price from inside the admin
  panel — customers scanning or reading the label can't see cost data.

> **Tip:** filling in specs matters more than it looks — it's what
> populates the "Specifications" table and makes the automatic
> "Compare with similar products" table on each product page actually
> useful. Right now most existing products have these left blank.

## 2a. Share Product (video, image & captions)

Every product's Edit/list view has a **Share** button that opens a
share modal with three things:

- **Caption**: a ready-to-post Instagram-style caption (hook line,
  size/fabric/what's-included, delivery line, price vs. MRP, call to
  action, hashtags) with a **Copy Caption** button — paste it wherever
  you're posting, since Instagram/Facebook don't accept a pre-filled
  caption through the share sheet.
- **Image**: a branded 1080×1920 image (photo, name, discounted price,
  "Click Here to Buy" CTA, and a QR code) — shares via your device's
  native share sheet on mobile, or downloads on desktop.
- **Video**: a short branded slideshow (about 9 seconds, longer with
  more photos) built from the product's photos, with:
  - **Ken Burns zoom** — a subtle continuous zoom across the whole
    video rather than per photo.
  - **Crossfade transitions** between photos, plus a bounce-in pop for
    the discount badge.
  - **Segmented progress bars** across the top, Instagram-Story style.
  - **Background music** — pick from a dropdown of 5 royalty-free
    tracks (or None); the chosen track is baked directly into the
    downloaded/shared video file, looped and faded to length.
  - A progress bar shows while the video is being generated (this can
    take a few seconds on longer videos).

A product marked **Visibility: Offline only** (§2) can't be shared —
the modal explains why instead of generating a broken link, since an
offline-only product has no live page for the link/QR code to point
to.

## 2b. In-Store / QR Sale (POS)

For selling in person (shop counter) while keeping everything in one
system:

1. Print a product's QR label from **Print QR Labels** (§2).
2. Scan it (any phone camera) to open that product's sale screen in
   the admin panel.
3. Add it to the sale — you can keep scanning/adding more products
   into the same transaction before completing it.
4. Adjust quantity or remove an item as needed.
5. Optionally enter a discount and/or upload a photo of payment proof
   (UPI screenshot, etc.), and pick the payment method (Cash / UPI /
   Card).
6. **Complete Sale.** If the customer's mobile number matches a
   registered account, loyalty points are awarded automatically, same
   as an online order. A receipt is available to print or send via
   WhatsApp.

In-store sales are recorded separately from online Orders (so they
don't show up in `/admin/orders`), but do count toward that
customer's loyalty points. A list of past in-store sales is available
from the same section.

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
- Every status change emails the customer automatically, and the
  customer now also gets a confirmation email the moment they place
  the order — not just when you first change its status.
- Each order's **Price Breakdown** shows exactly what the customer was
  charged: items, delivery fee, COD charge (if COD), any coupon and
  bundle discount applied, and loyalty points redeemed — all locked in
  at the time the order was placed, so it won't shift later even if
  you change a setting like the delivery fee or COD charge afterwards.
- Paid-online orders (Razorpay) show the Razorpay order/payment
  reference on the order; COD orders don't.

### Send on WhatsApp

Each order has a **Send on WhatsApp** button that opens a `wa.me` chat
link (in a new tab) with a message already filled in for you,
matching that order's current status (placed / shipped / delivered /
etc.) — you review it and hit send yourself from your own WhatsApp.
This is manual for now because automated WhatsApp order messages are
blocked until the store's Meta Business Verification goes through
(pending a document tied to an in-progress Udyam re-registration); the
button is a stand-in so customers can still get a WhatsApp update in
the meantime.

### Delete / Restore

An order can only be deleted once it's **Cancelled** — this prevents
accidentally losing an active order. Delete is a soft delete: the
order disappears from the main list but isn't gone. Use **Restore**
to bring it back, or **Permanent Delete** to remove it for good (this
is blocked if the order still has a linked return request or support
ticket attached to it, so unlink or resolve those first).

## 4a. Returns (`/admin/returns`)

Every return request a customer has raised, with its product, reason,
and quantity. Move it through `Requested → Approved/Rejected → Picked
Up → Refunded`, optionally adding a note the customer will see. Each
status change emails the customer and posts a bell + in-app
notification.

- Moving a return to **Picked Up** (or straight to **Refunded**)
  automatically adds the returned quantity back to that product's
  stock.
- Moving a return to **Refunded** automatically claws back the
  loyalty points that item earned — just that item's share of the
  order, not the whole order's points — but only if the order was
  actually delivered (and so had earned points to begin with).
- Both of the above only ever happen once per return, even if you
  change the status back and forth.

> The actual **payment refund** (giving the customer their money back)
> is still manual — for both COD and Razorpay orders, there's no
> automatic refund-to-source. For a Razorpay order, process the refund
> from your Razorpay dashboard yourself; for COD, refund by whatever
> means you've agreed with the customer.

## 4b. Support Tickets (`/admin/tickets`)

Every ticket a customer has raised, optionally linked to one of their
orders. Open one to read the full thread and reply — your reply emails
the customer and posts a notification. Change status between Open, In
Progress, Resolved, and Closed; if a customer replies on a
Resolved/Closed ticket, it reopens to Open automatically.

## 5. Reviews & Questions (`/admin/reviews`, `/admin/questions`)

Customer reviews and product questions sit here until you approve /
answer them — nothing customer-submitted appears publicly until you
act on it. Answering a question publishes it and it also becomes part
of that product's FAQ rich-result data for Google.

Reviews can include up to 3 customer photos and one short video, shown
alongside the rating and text — review them the same way as text-only
reviews before approving. Approving a review tied to a Delivered order
also credits the customer a small loyalty-point bonus (capped per
order, so several reviews from one order can't each claim it) —
deleting an approved review claws those points back automatically.

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
| **New Arrivals Sections** | Pick which categories get a "New Arrivals" section on the homepage and `/new-arrivals`, and in what order. A category not listed here (or switched inactive) simply doesn't get a section — individual products can still opt out via **Show in New Arrivals** on the product itself (§2). |
| **Trending Sections** | Pick which categories get a "Top Trending" carousel on the homepage and `/trending`, and in what order. Which products appear within each carousel is still controlled by each product's own **Show in Trending** / rank (§2). |
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
- **COD Charge**: a flat rupee amount (default ₹50) added to the order
  total whenever a customer chooses Cash on Delivery, meant to offset
  the courier's real COD handling fee. It never applies to Razorpay
  (online payment) orders. Shown to the customer at checkout and on
  their order, and in this order's own Price Breakdown for you.
- **Complete the Look (bundle discount rules)**: pair up two
  categories (e.g. Bedsheets + Cushion Covers) with a discount
  percentage and an active toggle — no deploy needed. When a
  customer's cart qualifies for more than one active rule, the rule
  that gives the bigger rupee discount is the one applied. Add as many
  rule pairs as you like; switch a rule inactive to pause it without
  deleting it.
- **Pricing Rules**: per-category (optionally per-subcategory) formula
  used to auto-suggest Misc. Expenses %, MRP multiplier, and Price
  discount % when an admin enters a Purchase Price on Add/Edit Product
  (§2). Products in a category with no rule fall back to a default
  formula (10% misc., MRP = 2× cost, price 15% below MRP).
- **Welcome Popup**: on/off switch for the popup shown to new/guest
  visitors (and the "Registration Successful" variant shown right
  after signing up) — turn it off if you want the storefront quieter
  for a while. A **Preview Popup** button next to it (and a second one
  for the registration-success variant) lets you check how it looks
  without waiting for it to trigger naturally.

## 9. Customers (`/admin/customers`)

List and search customers, view their order history, block/unblock an
account.

## 9a. Product Walkthrough (`/admin/walkthrough`)

A self-contained, screenshots-and-copy reference covering both the
storefront and the admin panel — useful for training a new team member
or refreshing your own memory on a section you don't touch often.
Linked from the sidebar; has a print/download button. It updates as
the product does, so it's generally more current than a printed guide.

## 10. Reports (`/admin/reports`)

A higher-level view than the dashboard summary, for a chosen date
range — pick one of the 7/30/90-day presets or **Custom** for a
specific start/end date. Every number on the page is scoped to that
range, except **Total Customers** which is always shown all-time.

- **Revenue & Orders** — with growth % against the equal-length prior
  period (shows "—" instead of a misleading 0%/∞ when there's nothing
  to compare against). Total Sales/revenue figures exclude Cancelled
  orders throughout, on this page and the Dashboard.
- **Cart Abandonment** — a live snapshot (carts inactive 3+ hours),
  intentionally **not** tied to the date range — an abandoned cart
  disappears from tracking the moment it turns into an order, so
  there's no history to filter by date.
- **Sales & Website Visits** — trend charts over the range.
- **Conversion Funnel** — Visitors → Product Viewers → Cart Viewers →
  Checkout Viewers → Orders Placed. Labeled approximate: visits are
  tracked by an anonymous ID, not linked to accounts, so this can't be
  joined to orders precisely.
- **Search Analytics** — top search queries and zero-result searches
  (a good source of "products customers want but can't find").
- **Orders by Status**, **Top Pages**, **Device Breakdown**, **Top
  Selling Products**, **Revenue by Category**, **Visitor Locations**.
- **Loyalty & Referral Performance** — points earned/redeemed/expired
  with a rough redemption rate, plus referral signups, conversions,
  and total bonus points paid out. **Points Earned** nets out any
  clawback (points reversed when a delivered order is later
  cancelled), so it reflects points customers actually still hold, not
  the raw total ever credited.
- **Export CSV** — downloads the entire report (every section above)
  as one multi-section CSV file for the selected range.
- **Google Analytics & Search Console** — live data pulled directly
  from Google (not this site's own tracking): Active Users, Sessions,
  Page Views, Engagement Rate and Top Pages from GA4; Clicks,
  Impressions, CTR, Average Position and Top Search Queries from
  Search Console. Only works with the 7/30/90-day presets, not a
  custom date range. If it shows "data isn't available," the server's
  Google credentials need attention — see `DEPLOYMENT.md` §4.6.

### 10.1 Product Engagement

A separate table, further down the Reports page, one row per product:
how many times it's been viewed, how many people currently have it
wishlisted, and how many currently have it in their cart. Its own
date-range control sits above the table — **All time**, **Today**,
**Yesterday**, or **Custom** — and scopes only the Views column;
wishlist/cart counts are always a live current-state snapshot ("how
many people have it right now"), never a historical total for the
selected range.

Click any of the three numbers to open a drill-down listing exactly
who — name, mobile, email where known, and when. All three
drill-downs (**Wishlisted by**, **Currently in cart of**, **Viewed
by**) include guest visitors as well as logged-in customers, shown as
"Guest (not logged in)" with no contact details, each with the exact
date and time. Use **Export CSV** at the top of the table for the
whole product list, or the **Export CSV** inside a drill-down modal
for just that product's list of people.

## 11. Things That Run on Their Own (no admin action needed)

- **Abandoned cart emails** — hourly, automatic.
- **Points expiry** — daily, automatic (you can also trigger it
  manually if needed — ask a developer, it's not exposed in the UI).
- **Order confirmation email** — sent the moment a customer places an
  order, before you've touched it.
- **Order status emails**, **welcome emails**, **back-in-stock
  alerts** — automatic on the relevant trigger.
- **Review-request email** — sent automatically about 8 days after an
  order is marked Delivered, asking the customer to review what they
  bought (timed to land after the return window, so it only reaches
  customers who genuinely kept the item). Each order is only emailed
  once.
- **Wishlist price-drop email** — sent automatically whenever a
  logged-in customer's wishlisted product's price drops (guest
  wishlist items have no account to email, so they're skipped); the
  same drop is never re-sent on a later run.
- **In-app notifications** — fire alongside the emails above (order
  status, ticket replies, return status, back-in-stock, points
  expiry) so a customer sees them in the site bell too, no separate
  action needed.
- **Force sign-out** — if an account is deleted or blocked (or a login
  session expires), that browser is automatically signed out and sent
  to the login page on its next action — nothing you need to do beyond
  blocking/deleting the account itself.
- **Sitemap** — regenerated automatically every time the site is
  deployed, so new products/articles/categories are always included
  for Google.
