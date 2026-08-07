# System Architecture

**Project:** Mittal Collections
**Document version:** 1.0
**Last updated:** 2026-08-07

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
                  └───┬────────┬────────┬────────┬───┘
                      │        │        │        │
              ┌───────▼──┐ ┌───▼────┐ ┌─▼──────┐ ┌▼────────────┐
              │ MongoDB  │ │Cloudin-│ │ Brevo  │ │cron-job.org │
              │ Atlas    │ │ary     │ │(email) │ │(scheduler)  │
              └──────────┘ └────────┘ └────────┘ └─────────────┘
```

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
│   └── server.js              App entry point — middleware + route mounting
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
logged-in user) — abandoned-cart reminders, points expiry — instead
check a shared secret (`CRON_SECRET`) passed as a query parameter.

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

### 4.5 Scheduled Jobs
Render's free tier cannot run a reliable in-process scheduler (the
process sleeps when idle), so recurring jobs are triggered externally
by **cron-job.org** making an HTTP POST to a secret-protected endpoint:

| Job | Endpoint | Schedule |
|---|---|---|
| Abandoned cart reminders | `POST /api/cart/send-abandoned-reminders?secret=...` | Hourly |
| Loyalty points expiry | `POST /api/rewards/expire-points?secret=...` | Daily |

## 5. Data Flow — Order Placement (representative example)

1. Client posts cart items + address + payment method + optional coupon/points to `POST /api/orders`.
2. Server computes subtotal, resolves delivery fee via `calculateDeliveryFee()`, validates/applies coupon, caps and applies loyalty-point redemption.
3. Server atomically reserves stock per line item (`reserveStock`); on any failure, already-reserved items are rolled back and the specific out-of-stock item is named in the error.
4. Order document is created; if points were redeemed, `applyLoyaltyPointsChange()` deducts them and writes the ledger row.
5. Cart snapshot (server-side abandoned-cart mirror) is deleted.
6. Client clears its local cart and redirects to order confirmation.
7. Later, when admin marks the order **Delivered**: points are credited (earn), a first-delivered-order referral bonus is paid out if applicable, and a status email is sent. Marking a delivered order **Cancelled** instead claws back the earned points and refunds any redeemed points.

## 6. Deployment Topology

| Component | Host | Notes |
|---|---|---|
| Frontend | Vercel | Static Vite build; SPA rewrite (`vercel.json`) routes all paths to `index.html` |
| Backend API | Render (free tier) | Sleeps on inactivity, cold-starts on next request |
| Database | MongoDB Atlas | |
| Media | Cloudinary | Images + product videos |
| Email | Brevo | HTTP API, not SMTP (Render blocks outbound SMTP) |
| Scheduler | cron-job.org | External, HTTP-triggered |

See `DEPLOYMENT.md` for environment variables and the exact release
process.
