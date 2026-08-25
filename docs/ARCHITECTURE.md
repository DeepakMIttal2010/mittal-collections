# System Architecture

**Project:** Mittal Collections
**Document version:** 1.2
**Last updated:** 2026-08-25

## 1. High-Level Overview

Mittal Collections is a classic **decoupled MERN application**: a React
single-page app talks to an Express/MongoDB REST API over HTTPS. There is
no server-side rendering and no shared codebase between client and server
beyond convention (both are plain JavaScript, ES modules).

```
                        ┌─────────────────────┐
                        │      Visitor's       │
                        │      Browser         │
                        └──────────┬───────────┘
                                   │ HTTPS
                                   ▼
                  ┌────────────────────────────────┐
                  │   React SPA (Vite build)        │
                  │   hosted on Vercel               │
                  │   www.mittalcollections.com      │
                  └────────────────┬─────────────────┘
                                   │ REST (JSON) over HTTPS
                                   ▼
                  ┌────────────────────────────────┐
                  │   Express API                    │
                  │   hosted on Render                │
                  │   mittal-collections-api.onrender │
                  └─┬──────┬──────┬──────┬──────┬────┬─┘
                    │      │      │      │      │    │
              ┌─────▼─┐ ┌──▼───┐ ┌▼─────┐ ┌▼──────────┐ ┌▼────────┐ ┌▼──────────┐
              │MongoDB│ │Cloud-│ │Brevo │ │cron-job.org│ │Razorpay │ │ WhatsApp  │
              │ Atlas │ │inary │ │(email)│ │(scheduler) │ │(payments)│ │ Cloud API │
              └───────┘ └──────┘ └──────┘ └────────────┘ └─────────┘ └───────────┘
```

Razorpay and the WhatsApp Cloud API are the two newest external
integrations (added 2026-08-22 and 2026-08-25 respectively) — see
§4.6 and §4.7 for details, current mode/status, and caveats before
relying on either in production.

## 2. Repository Layout

```
mittal-collections/
├── client/                  React frontend (Vite)
│   ├── src/
│   │   ├── pages/            One component per route (customer-facing)
│   │   │   └── admin/        Admin panel pages
│   │   ├── components/       Reusable UI pieces
│   │   │   └── admin/        Admin-only components
│   │   ├── context/          React Context providers (global client state)
│   │   ├── services/         One file per backend resource — thin fetch() wrappers
│   │   ├── utils/            Pure helper functions (no React/DOM dependency)
│   │   ├── layouts/          MainLayout (storefront chrome), AdminLayout, UserLayout
│   │   └── routes/           AppRoutes.jsx (route table), AdminProtectedRoute
│   ├── scripts/
│   │   └── generate-sitemap.js   Runs on every build (see package.json "prebuild")
│   └── public/                robots.txt, generated sitemap.xml, static assets
│
├── server/                   Express backend
│   ├── models/                One Mongoose schema per file
│   ├── controllers/           Business logic, one file per resource
│   ├── routes/                Express routers, one file per resource
│   ├── middleware/            authMiddleware, adminMiddleware, uploadMiddleware, imageOptimizer
│   ├── config/                db.js (Mongo connection), cloudinary.js, mailer.js
│   ├── utils/                 Shared logic: shipping fee calc, loyalty points, referral codes, fuzzy search
│   ├── tests/                 Vitest + Supertest integration tests (order placement, loyalty points) against an in-memory MongoDB
│   ├── app.js                 Express app — middleware + route mounting, no DB connect or listen (this is what tests import)
│   └── server.js              Process entry point — connects to MongoDB, then starts `app` listening
│
├── e2e/                      Playwright browser tests (separate npm package) — see e2e/README.md
│
└── docs/                     This documentation set
```

## 3. Frontend Architecture

### 3.1 Routing & Code-Splitting
`AppRoutes.jsx` defines every route. `Home`, layout components, and
routing infra load eagerly; every other page (including the **entire**
`/admin/*` tree) is wrapped in `React.lazy()` so it ships as its own
chunk, only downloaded when a visitor actually navigates there. This is
why the admin panel's ~200KB rich-text editor never reaches a normal
shopper's browser.

`MainLayout` wraps all customer-facing routes and renders (in order):
top promo banners → `Header` → `Navbar` → the routed page (`<Outlet/>`)
→ `Footer`, plus always-mounted overlays: `CartDrawer`,
`WelcomeBenefitsPopup`. `App.jsx` additionally mounts global,
non-route-specific widgets (`WhatsAppButton`, `CompareBar`,
`BackToTopButton`) everywhere except `/admin/*`.

### 3.2 State Management
No Redux/Zustand — state is handled with plain React Context, split by
concern:

| Context | Backing store | Purpose |
|---|---|---|
| `AuthContext` | `localStorage` (`token`, `user`) | Current user, login/logout, `justLoggedIn` flag for popup triggers |
| `CartContext` | `localStorage` (`cartItems`) | Cart contents; debounced background sync to server for abandoned-cart detection only |
| `WishlistContext` | Server (requires login) | Wishlist items |
| `CompareContext` | `localStorage` (`compareItems`, max 4) | Manual product comparison list |

Everything else is local `useState`/`useEffect` per page/component —
there is no global "app state" beyond the four contexts above.

### 3.3 Data Fetching
Every backend resource has a matching file in `services/` exporting
plain `async` functions that wrap `fetch()`, attach the JWT (from
`localStorage`) where needed, and normalize the response shape
(`{ success, ... }`). Pages call these directly inside `useEffect` —
there is no data-fetching library (no React Query/SWR).

### 3.4 SEO Layer
A shared `<Seo>` component (wrapping `react-helmet-async`) sets
`<title>`, meta description, Open Graph/Twitter tags, canonical URL, and
accepts one or an array of JSON-LD blocks. Pages that need multiple
structured-data blocks (e.g. a product page needs Product + Breadcrumb
+ FAQ schema) pass an array. `utils/breadcrumbJsonLd.js` centralizes
breadcrumb schema construction so the visible `<Breadcrumbs>` component
and the JSON-LD always agree.

### 3.5 Notification Bells
Two independent bell components exist — `Header.jsx` (customer, logged-in
only) and `AdminHeader.jsx` (admin) — each with its own local
`useState`/`setInterval` poll (every 30s) against its own endpoint
(`GET /api/notifications` vs `GET /api/admin/notifications`). They are
not unified into a shared context or component since the two feeds have
different shapes, sources, and click-through targets; both follow the
same interaction pattern (badge count → dropdown → click marks
seen/read and navigates).

## 4. Backend Architecture

### 4.1 Request Flow
`server.js` wires middleware in this order: `helmet` → `compression` →
`cors` (origin allow-list) → `express.json`/`urlencoded` →
`express-rate-limit` (scoped to `/api/auth`) → static `/uploads` →
one router per resource, mounted under `/api/<resource>`.

Each route file wires: public routes (no middleware) → routes needing
`authMiddleware` (any logged-in user) → routes needing
`authMiddleware` + `adminMiddleware` (admin only). Route ordering
matters where a static path (e.g. `/admin`) must be declared before a
dynamic one (`/:id`) on the same router.

### 4.2 Auth
JWT-based, stateless. `authMiddleware` verifies the token, loads the
user, and attaches it to `req.user`. `adminMiddleware` (chained after
`authMiddleware`) additionally checks `req.user.role === "admin"`.
A small set of endpoints intended for an external scheduler (not a
logged-in user) — abandoned-cart reminders, loyalty points expiry, and
(added 2026-08-24) post-delivery review-request emails — instead check
a shared secret (`CRON_SECRET`) passed as a query parameter. Each of
these routes accepts both `GET` and `POST` (cron-job.org defaults to
`GET` and offers no reliable way to change it — a real production bug
where two of these jobs silently 404'd for months was traced to this
and fixed 2026-08-13, see §4.5).

The `POST/GET /api/whatsapp/webhook` endpoint uses a different, related
pattern: instead of `CRON_SECRET`, `GET` is gated by Meta echoing back
a `hub.verify_token` that must match `WHATSAPP_VERIFY_TOKEN` (Meta's
own dashboard-verification handshake, not a scheduler), and `POST`
(inbound event delivery) currently has no signature check at all —
flagged as not-yet-implemented, see §4.7.

### 4.3 File Uploads
`multer` (memory storage, MIME/size-filtered) receives the file →
`imageOptimizer` middleware (sharp) resizes/compresses images →
`cloudinary.uploader.upload` stores the final asset and returns a CDN
URL, which is what's saved on the Mongoose document. Legacy documents
predating the Cloudinary migration store a relative `/uploads/...`
path instead, served directly by Express's static middleware — this is
why the API's CORS/CORP headers must explicitly allow cross-origin
image loading from the Vercel-hosted frontend.

### 4.4 Cross-Cutting Utilities (`server/utils/`)
- `shipping.js` — `calculateDeliveryFee(subtotal, settings)`, mirrored client-side in `client/src/utils/shipping.js` so the checkout preview always matches what the server will actually charge.
- `loyaltyPoints.js` — every points balance change (earn, redeem, refund, clawback, referral bonus, expiry) goes through one `applyLoyaltyPointsChange()` helper that atomically updates the user's balance **and** writes a `LoyaltyTransaction` ledger row, so the ledger can never drift from the live balance.
- `referral.js` — referral code generation/lookup.
- `fuzzySearch.js` — Levenshtein-distance product ranking for search/autocomplete.
- `notify.js` — `notifyUser({userId, type, title, message, link})` creates one customer-facing `Notification` row, fire-and-forget (`.catch()` only, matching the `SearchLog.create()` pattern) so a notification failure never blocks the request that triggered it. Called alongside every customer email (order status, ticket reply, return status, back-in-stock, points expiry) rather than replacing it.

### 4.5 Scheduled Jobs
Render's free tier cannot run a reliable in-process scheduler (the
process sleeps when idle), so recurring jobs are triggered externally
by **cron-job.org** making an HTTP request (GET or POST — see §4.2) to
a secret-protected endpoint:

| Job | Endpoint | Schedule |
|---|---|---|
| Abandoned cart reminders | `GET/POST /api/cart/send-abandoned-reminders?secret=...` | Hourly |
| Loyalty points expiry | `GET/POST /api/rewards/expire-points?secret=...` | Daily |
| Post-delivery review-request emails | `GET/POST /api/orders/send-review-requests?secret=...` | Daily |

The review-request job (added 2026-08-24) follows the exact same
pattern as the two pre-existing jobs: it queries for `Delivered`
orders whose `deliveredAt` is 8+ days in the past (chosen so it lands
after the 7-day return window closes, signalling a genuine "kept it")
and `reviewRequestSent` is still `false`, sends one email per order
asking for a review per item, then sets `reviewRequestSent: true` so
the same order is never re-targeted on a later run. The corresponding
cron-job.org job was confirmed set up 2026-08-25 (see `DEPLOYMENT.md`).

### 4.6 Payment Integration (Razorpay)
Added 2026-08-22, made the default payment method (over COD) 2026-08-24.
Flow: client requests checkout → server computes `totalPrice` itself
(subtotal, delivery fee, COD charge if applicable, coupon/bundle/points
discounts — never trusts a client-supplied amount) and creates a
Razorpay order via the Razorpay Orders API → client opens Razorpay's
Standard Checkout modal using the returned `order_id` and the
`RAZORPAY_KEY_ID` (served by the backend at order-creation time, not
baked into the client build — there is no `VITE_*` Razorpay env var) →
on success, client posts the Razorpay payment/signature fields to
`POST /api/orders/verify-payment`, which recomputes and checks the
HMAC-SHA256 signature server-side (using `RAZORPAY_KEY_SECRET`, never
exposed to the client) before marking the order paid. If the customer
dismisses the modal or the payment fails, the Order document still
exists in `Pending`/unpaid state and can be paid later from My Orders.

**Current mode: test, not live.** The integration has only been
verified end-to-end against Razorpay's **test-mode** credentials
("returns a real Razorpay test order" per the introducing commit) — no
commit has switched `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` to live
keys or confirmed a real transaction. Confirm the production key mode
before treating online payments as genuinely live.

COD orders carry a separate, server-computed `codCharge` (see
`DATABASE.md`, `Order.codCharge`) added the same week the payment
method was flipped to default-Razorpay; it is never applied to
Razorpay orders.

### 4.7 WhatsApp Cloud API Integration
Added 2026-08-25 (`whatsappController.js` / `whatsappRoutes.js`,
mounted at `/api/whatsapp`). Currently **receive-only**:

- `GET /api/whatsapp/webhook` — Meta's dashboard Callback URL
  verification handshake: echoes back `hub.challenge` when
  `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`.
- `POST /api/whatsapp/webhook` — receives message-status/incoming-message
  events from Meta and acknowledges immediately regardless of payload
  content (Meta disables webhooks that respond slowly). Payload
  signature verification is **not yet implemented**.

Neither route uses `authMiddleware`/`adminMiddleware` — Meta is not a
logged-in session, so the verify token (GET) / lack of signature check
(POST, a known gap) is the only gate.

**Status:** the webhook is live and verified with Meta. **There is no
message-sending code in this codebase** — automated, business-initiated
WhatsApp messages (order confirmations, status updates) are blocked
pending Meta Business Verification, which requires a business-name-matching
document not currently available. Until that clears, two manual
stand-ins fill the gap, both plain `wa.me` deep links requiring no API
access or verification:
1. A per-order "Send WhatsApp Update" button in `AdminOrders.jsx`
   (added 2026-08-25) that opens a `wa.me` link pre-filled with a
   message reflecting the order's current status, in a new tab, for
   the admin to review and send manually.
2. The pre-existing "Send Bill on WhatsApp" button on POS receipts.

Do not describe automated WhatsApp order-status messaging as live
anywhere in the docs until message-sending is actually implemented and
Meta Business Verification clears.

### 4.8 Soft-Delete Pattern
Both `Product` and (as of 2026-08-24) `Order` use the same soft-delete
convention: an `isActive: Boolean` flag (default `true`) rather than a
hard `deleteOne`. A `DELETE` on either resource sets `isActive: false`
and a `PUT .../:id/restore` flips it back; a genuinely permanent delete
is a separate, more tightly guarded endpoint (`DELETE .../:id/permanent`)
that checks for and blocks on other documents still referencing the
record — for `Order`, an existing `ReturnRequest`/`Ticket`; for
`Product`, `OfflineSale` in addition to `Order`, plus best-effort
cleanup of dangling `Wishlist`/`StockAlert`/`Review` rows and the
underlying Cloudinary asset. `Order` additionally only allows the
soft-delete step once `orderStatus === "Cancelled"`, and
`updateOrderStatus` refuses to run against an already-soft-deleted
order (enforced server-side, with the status dropdown also disabled
client-side as a UX nicety, not a security boundary).

`Address` also moved to a soft-delete flag in this period, but
currently has no restore endpoint — only `Product` and `Order` follow
the full delete/restore pair described above.

### 4.9 Bot-Prerendering / Self-Healing Canonical URLs
`client/api/render.js` is a Vercel serverless function that serves
crawlers (Googlebot, facebookexternalhit, WhatsApp, Twitterbot, etc.)
real, pre-rendered meta tags instead of the blank SPA shell, routed via
`has`-header rewrites in `vercel.json` that match known bot
user-agents. Originally product/category pages only (2026-08-14),
extended to cover articles and the homepage (2026-08-24; the homepage
branch turned out to be unreachable in practice — Vercel serves the
static `index.html` for an exact `/` match ahead of any `vercel.json`
rewrite, bot or not — a proper fix needs Vercel Edge Middleware and is
deferred).

The self-healing part: the canonical URL `render.js` emits is derived
from the product/category document's **current** slug, not the slug in
the incoming request URL. This matters because product slugs change
(e.g. the SEO-title-convention rename that appended sizes to names) —
before this fix (2026-08-24) the canonical echoed whatever stale slug
the crawler happened to request, which Search Console flagged as
"Duplicate without user-selected canonical" on 20+ products after a
rename. Now a request against an old slug still resolves the document
and canonicalizes forward to wherever it currently lives, so slug
renames no longer require any manual redirect bookkeeping to stay
canonical-clean. `render.js` also returns a genuine HTTP 404 (not a
soft-200) when it confidently resolves "not found" for a product or
category.

## 5. Data Flow — Order Placement (representative example)

1. Client posts cart items + address + payment method + optional coupon/points to `POST /api/orders`.
2. Server computes subtotal, resolves delivery fee via `calculateDeliveryFee()`, adds `codCharge` if `paymentMethod === "COD"` (from `SiteSettings.codCharge`), validates/applies coupon, applies "Complete the Look" bundle discount if a qualifying category pair is in the cart (highest-rupee-discount rule wins when multiple pairs qualify), and caps and applies loyalty-point redemption. Every one of these components is snapshotted onto the Order document at creation time (not re-derived later), so a subsequent settings/rule change never rewrites past order history.
3. Server atomically reserves stock per line item (`reserveStock`); on any failure, already-reserved items are rolled back and the specific out-of-stock item is named in the error.
4. Order document is created; if points were redeemed, `applyLoyaltyPointsChange()` deducts them and writes the ledger row. An order-confirmation email is sent immediately (added 2026-08-24 — previously customers heard nothing until an admin changed status).
5. If `paymentMethod === "Razorpay"`, the client separately opens the Razorpay Checkout modal and, on success, calls `POST /api/orders/verify-payment` to verify the signature and mark the order paid (see §4.6). COD orders are considered payable-on-delivery from creation.
6. Cart snapshot (server-side abandoned-cart mirror) is deleted.
7. Client clears its local cart and redirects to order confirmation.
8. Later, when admin marks the order **Delivered**: points are credited (earn), a first-delivered-order referral bonus is paid out if applicable, and a status email is sent. Marking a delivered order **Cancelled** instead claws back the earned points and refunds any redeemed points. 8 days after delivery, if no review-request email has been sent yet for that order, the daily review-request cron job (§4.5) sends one.

## 6. Deployment Topology

| Component | Host | Notes |
|---|---|---|
| Frontend | Vercel | Static Vite build; SPA rewrite (`vercel.json`) routes all paths to `index.html` |
| Backend API | Render (free tier) | Sleeps on inactivity, cold-starts on next request |
| Database | MongoDB Atlas | |
| Media | Cloudinary | Images + product videos; weekly asset backup via GitHub Actions (added 2026-08-15) |
| Email | Brevo | HTTP API, not SMTP (Render blocks outbound SMTP) |
| Scheduler | cron-job.org | External, HTTP-triggered |
| Payments | Razorpay | Standard Checkout; **test mode** as of last verification, see §4.6 |
| Messaging | WhatsApp Cloud API (Meta) | Webhook only (receive); sending blocked on Meta Business Verification, see §4.7 |

See `DEPLOYMENT.md` for environment variables and the exact release
process.
