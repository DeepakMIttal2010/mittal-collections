# Software Requirements Specification (SRS)

**Project:** Mittal Collections
**Document version:** 1.3
**Last updated:** 2026-08-25

This document covers technical and non-functional requirements. For
feature-level functional requirements, see `FRS.md`.

## 1. Technology Stack

### 1.1 Frontend (`client/`)
| Layer | Choice |
|---|---|
| Framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router v7 (route-based code-splitting via `React.lazy`) |
| Styling | Tailwind CSS v4 |
| Rich text editor | react-quill-new (admin only) |
| SEO tags | react-helmet-async |
| Notifications | react-toastify |
| Icons | react-icons |
| CSV parsing (admin bulk import) | papaparse |
| Hosting | Vercel (SPA rewrite to `index.html`) |

### 1.2 Backend (`server/`)
| Layer | Choice |
|---|---|
| Runtime | Node.js, Express 5 |
| Database | MongoDB (Mongoose 9 ODM), hosted on MongoDB Atlas |
| Auth | JWT (`jsonwebtoken`), password hashing via `bcryptjs` |
| File uploads | Multer (memory storage) → Cloudinary (images/videos) |
| Image processing | `sharp` (server-side optimization) |
| Email | Brevo transactional HTTP API (**not** SMTP — see §4) |
| Security | `helmet`, `express-rate-limit`, restricted `cors` |
| Performance | `compression` (gzip), MongoDB compound indexes |
| Geo lookup | `geoip-lite` (for analytics) |
| Hosting | Render (free tier) |

### 1.3 External Services
| Service | Purpose |
|---|---|
| MongoDB Atlas | Primary database |
| Cloudinary | Image/video storage + delivery for products, categories, banners, articles; weekly asset backup via the Admin API (see §2.3) |
| Brevo | Transactional email (order status, order confirmation, welcome, password reset, abandoned cart, back-in-stock, newsletter, post-delivery review request). Supports an optional BCC to `ADMIN_NOTIFICATION_EMAIL` (registration OTP, welcome, every order-status-change email) so the admin can confirm delivery without relying on customer reports. |
| cron-job.org | External scheduler — hits secret-protected endpoints since Render's free tier can't run reliable in-process cron (sleeps when idle) |
| Razorpay | Online payment method (alongside COD): Standard Checkout modal, order creation from a server-computed total, payment signature verification (HMAC-SHA256) server-side before marking an order paid. **Integrated 2026-08-22 and made the default checkout payment method 2026-08-24; verified end-to-end in Razorpay's test mode only — live-mode credentials/transactions have not been confirmed as of this document.** Refunds are still issued manually via the Razorpay dashboard (no refund-automation integration). |
| WhatsApp Cloud API (Meta) | Webhook only (`GET`/`POST /api/whatsapp/webhook`), added 2026-08-25: `GET` verifies the Callback URL for Meta's dashboard (echoes `hub.challenge` against `WHATSAPP_VERIFY_TOKEN`); `POST` receives message-status/incoming-message events and acknowledges immediately. Live and verified with Meta as a receiving webhook. **No outbound/business-initiated message-sending integration exists** — blocked on Meta Business Verification (pending a business-name-matching document; Udyam re-registration in progress). A manual per-order `wa.me` deep-link button in the admin panel and the pre-existing POS-receipt/product-share `wa.me` links are the interim stand-ins. Payload signature verification on the webhook is not yet implemented. |
| Google Analytics 4 | Traffic analytics (client-side tag, deferred to load after `window.load`, excluded from `/admin/*` routes so admin usage doesn't pollute customer-traffic numbers), plus server-side reporting into Admin Reports via a read-only Google service account (see §4) |
| Google Search Console | Search performance + indexing, plus server-side reporting into Admin Reports via the same service account |
| Google Merchant Center / Meta Commerce Manager | Product catalog feed (`GET /api/feed/google.xml`, RSS 2.0 + Google Shopping namespace) of every active, online-visible product, added 2026-08-12 |

## 2. Non-Functional Requirements

### 2.1 Performance
- NFR-P1: Route-based code-splitting keeps the storefront's initial JS bundle small; admin-only code (incl. the ~200KB rich-text editor) must never load for a non-admin visitor. *(Achieved: main bundle reduced from ~954KB to ~285KB.)*
- NFR-P2: All API responses are gzip-compressed.
- NFR-P3: MongoDB queries on hot paths (product listing/filtering, order history, best-seller aggregation) must be covered by compound indexes.
- NFR-P4: Product images are optimized server-side (`sharp`, max 1600px dimension, JPEG quality 85 via mozjpeg) before storage. **Applies to every real upload through the admin panel automatically** — any image placed into `server/uploads/` outside that flow (e.g. seed/demo data) bypasses it and must be compressed manually. This gap was found and fixed 2026-08-08: seed category/banner/product images were shipping as raw 2.5-3MB camera-resolution JPEGs (the homepage hero banner alone cost ~1.2s just to download); recompressed in place with the same settings, dropping total seed image weight from 72.8MB to 9.0MB (~87% smaller) with no visible quality loss.
- NFR-P5: Product listing/search must return results without a dedicated search-service dependency (justified by current catalog size — a custom Levenshtein-based ranker is used instead of e.g. Elasticsearch/Algolia). Every real search (not autocomplete keystrokes) is logged to `SearchLog` fire-and-forget, feeding the admin search-analytics report without adding request latency.
- NFR-P6: The customer and admin notification bells poll every 30 seconds rather than using a persistent connection (WebSocket/SSE) — acceptable at current traffic; would need revisiting if near-real-time delivery becomes a requirement.

### 2.2 Security
- NFR-S1: Passwords stored only as bcrypt hashes (cost factor 10), never plaintext.
- NFR-S2: JWT-based auth, 7-day expiry; admin endpoints require both a valid JWT and `role: admin`.
- NFR-S3: API accepts browser requests only from allow-listed origins (`www.mittalcollections.com`, `mittalcollections.com`, localhost dev ports) — enforced via CORS; not applicable to server-to-server calls (e.g. the cron scheduler).
- NFR-S4: Standard security headers via `helmet` (HSTS, X-Frame-Options, X-Content-Type-Options, etc.); CSP disabled (pure JSON API, no HTML to protect) and `Cross-Origin-Resource-Policy` explicitly set to `cross-origin` so the frontend can still load legacy same-server-hosted images.
- NFR-S5: `/api/auth/*` is rate-limited (20 requests / 15 minutes / IP) to slow credential brute-forcing.
- NFR-S6: File uploads are restricted by MIME type (images: jpg/jpeg/png/webp; product media additionally allows mp4/webm/mov) and size (5MB images, 20MB product video).
- NFR-S7: Scheduler-only endpoints (abandoned-cart reminders, points expiry) are protected by a shared secret query parameter, not JWT, since they're called by an external cron service rather than a logged-in user.
- NFR-S8: No secrets committed to the repository; all credentials live in `.env` (gitignored) / hosting-provider environment variables.
- NFR-S9: Razorpay order amounts are always computed server-side from the current cart/order contents, never accepted from the client; payment authenticity is confirmed by verifying the Razorpay payment signature (HMAC-SHA256) server-side, using `RAZORPAY_KEY_SECRET`, before an order is marked paid.
- NFR-S10: The WhatsApp Cloud API webhook is gated by a verify token (`WHATSAPP_VERIFY_TOKEN`) matched against Meta's dashboard configuration on `GET` requests, rather than JWT (Meta is not a logged-in session). Payload signature verification on incoming `POST` events is not yet implemented — flagged as a gap to close before this endpoint is trusted for anything beyond acknowledgment.
- NFR-S11: Order permanent-delete and soft-delete/restore are admin-only; soft-delete is only permitted once an order is Cancelled, and permanent delete is blocked while a return request or support ticket still references the order.
- **Resolved (2026-08-08):** `cloudinary` was pinned at v1.41.3, which had a disclosed high-severity vulnerability (GHSA-g4mf-96x5-5m2c). Upgraded to v2.10.0 — `npm audit` now reports 0 vulnerabilities. All real upload flows (product, category, banner, article) were manually re-verified against real Cloudinary credentials on local dev before deploying; production is deployed and healthy but a real upload wasn't independently re-tested there. Full record in `docs/CLOUDINARY_MIGRATION_PLAN.md` §6.

### 2.3 Availability / Reliability
- NFR-A1: Backend runs on Render's free tier, which sleeps after inactivity and cold-starts on the next request — acceptable for current traffic; noted as a constraint, not a defect.
- NFR-A2: Scheduled jobs (abandoned cart, points expiry) run via an external scheduler (cron-job.org) rather than in-process, since an in-process scheduler would not survive Render's sleep/wake cycle.
- NFR-A3: Order placement is transactionally safe at the stock level — stock is reserved per item with automatic rollback of already-reserved items if any single item fails, so an order is never partially created against insufficient stock.
- NFR-A4: Render's auto-deploy-on-push has, at least once in practice, silently stopped picking up new commits to `main` for several hours with no error surfaced anywhere — the fix was a manual "Deploy latest commit" from the Render dashboard. Deploy verification must therefore always include an actual post-deploy endpoint check (see `DEPLOYMENT.md` §6), never just "the push succeeded."
- NFR-A5: In addition to the pre-existing weekly MongoDB backup, a weekly Cloudinary asset backup (GitHub Actions, Sunday 04:00 UTC) reads every image/video via the Cloudinary Admin API using `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` set as GitHub repo secrets. A green CI run is not sufficient evidence a backup is real — a genuine incident (§ below) produced empty archives with a passing status for a week; a periodic real-restore rehearsal is required, not just a checkmark.
- NFR-A6: Scheduled/cron-triggered endpoints (`/api/cart/send-abandoned-reminders`, `/api/rewards/expire-points`, `/api/orders/send-review-requests`) must accept both `GET` and `POST`, since cron-job.org defaults to `GET` and offers no reliable way to change it — a `POST`-only endpoint silently 404s on every scheduled run with no alert. All three jobs are confirmed set up on cron-job.org as of 2026-08-25.

### 2.4 Usability / Accessibility
- NFR-U1: Fully responsive (mobile-first Tailwind breakpoints); verified against narrow (≤375px) viewports for floating UI elements (WhatsApp button, Compare bar, Back-to-top).
- NFR-U2: All meaningful images carry descriptive `alt` text (audited; the homepage hero banner was migrated from a CSS `background-image`, which cannot carry alt text, to a real `<img>` for this reason).
- NFR-U3: Both light and (where styled) dark-friendly, high-contrast UI conventions; toast notifications for all async actions (cart, wishlist, forms).

### 2.5 SEO
- NFR-SEO1: Every public page must set a unique `<title>` and meta description.
- NFR-SEO2: Structured data must reflect what's actually visible on the page (e.g. breadcrumb schema is paired with a matching visible breadcrumb trail, not schema-only).
- NFR-SEO3: `sitemap.xml` must be regenerated on every frontend build so new content (products, articles, categories) is always included.
- NFR-SEO4: Legacy/renamed URLs must redirect via real HTTP redirects (Vercel `redirects` in `client/vercel.json`, 308 status), not client-side-only `<Navigate>`. **Resolved (2026-08-08):** Google Search Console flagged "Page with redirect" for 6 legacy top-level category paths (`/bedsheets`, `/towels`, `/curtains`, `/pillows`, `/blankets`, `/offers`) that redirected purely via React Router `<Navigate replace>` — Googlebot's crawl saw a 200 response, then a JS-driven `history.replaceState`, which GSC excludes from indexing. Added matching entries to `client/vercel.json` `redirects` so Vercel's edge now serves a real 308 for these paths before the SPA ever loads; the `<Navigate>` routes in `AppRoutes.jsx` are kept as a harmless fallback for local dev (Vite's dev server doesn't apply `vercel.json`).

### 2.6 Maintainability
- NFR-M1: No ORM/query abstraction beyond Mongoose — controllers query models directly; kept simple deliberately given team size.
- NFR-M2: Admin-configurable values (shipping fees/tiers, loyalty/referral rates) live in a singleton settings document with an audit-trail log, rather than hardcoded constants, specifically because hardcoded values have caused stale-content bugs before (e.g. the Shipping Policy page once quoted an outdated free-shipping threshold).
- NFR-M3: Shared logic (delivery-fee calculation, breadcrumb JSON-LD construction) is deduplicated between client and server / across pages via small utility modules rather than copy-pasted per page.

## 3. Browser / Device Support

- Modern evergreen browsers (Chrome, Edge, Safari, Firefox) — no explicit legacy browser support target.
- Mobile and desktop responsive; primary customer base is India-focused (COD default payment method, INR currency, India-only shipping).

## 4. Key Technical Constraints & Decisions

- **Render free tier blocks outbound SMTP** (confirmed via direct testing — both ports 465 and 587 time out). This is why email is sent via Brevo's HTTPS API rather than nodemailer/SMTP, and why scheduled jobs run via an external HTTP-triggered cron service instead of an in-process scheduler.
- **Cart is client-side only** (localStorage) for both guests and logged-in users — never persisted server-side as the source of truth. A debounced server-side snapshot exists solely to enable abandoned-cart email detection and is never read back into the UI.
- **No dedicated search service** — catalog size does not currently justify one; a custom fuzzy-matching utility is used instead.
- **New required environment variables since 2026-08-08** (full detail and per-variable notes in `DEPLOYMENT.md`): `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (Razorpay order creation + signature verification — required for online payment to function); `WHATSAPP_VERIFY_TOKEN` (WhatsApp Cloud API webhook verification — required once the Meta webhook is configured). `ADMIN_NOTIFICATION_EMAIL` is optional (enables BCC visibility on transactional emails; emails still send without it). No new client-side (`VITE_*`) variables were added — the Razorpay `key_id` is served to the frontend by the backend at order-creation time rather than baked into the client build.

## 5. Known Gaps / Follow-Ups

- **Razorpay live-mode confirmation**: production readiness for real (non-test) transactions has not been independently verified as of this document — confirm the live `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are in place and a live payment has actually been captured before treating online payment as production-ready.
- **WhatsApp Cloud API**: only the receiving webhook is live; do not represent automated WhatsApp order-status messaging as a working capability anywhere downstream of this document until Meta Business Verification completes and a message-sending integration is actually built.
- **WhatsApp webhook payload signature verification**: not yet implemented on `POST /api/whatsapp/webhook`; the endpoint currently trusts any payload that reaches it (acceptable only because it does not yet act on the payload beyond acknowledging it).
