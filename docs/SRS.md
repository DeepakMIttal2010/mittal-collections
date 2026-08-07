# Software Requirements Specification (SRS)

**Project:** Mittal Collections
**Document version:** 1.0
**Last updated:** 2026-08-07

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
| Cloudinary | Image/video storage + delivery for products, categories, banners, articles |
| Brevo | Transactional email (order status, welcome, password reset, abandoned cart, back-in-stock, newsletter) |
| cron-job.org | External scheduler — hits secret-protected endpoints since Render's free tier can't run reliable in-process cron (sleeps when idle) |
| Razorpay | Online payment method (alongside COD) |
| Google Analytics 4 | Traffic analytics (client-side tag) |
| Google Search Console | Search performance + indexing |

## 2. Non-Functional Requirements

### 2.1 Performance
- NFR-P1: Route-based code-splitting keeps the storefront's initial JS bundle small; admin-only code (incl. the ~200KB rich-text editor) must never load for a non-admin visitor. *(Achieved: main bundle reduced from ~954KB to ~285KB.)*
- NFR-P2: All API responses are gzip-compressed.
- NFR-P3: MongoDB queries on hot paths (product listing/filtering, order history, best-seller aggregation) must be covered by compound indexes.
- NFR-P4: Product images are optimized server-side (`sharp`) before storage.
- NFR-P5: Product listing/search must return results without a dedicated search-service dependency (justified by current catalog size — a custom Levenshtein-based ranker is used instead of e.g. Elasticsearch/Algolia).

### 2.2 Security
- NFR-S1: Passwords stored only as bcrypt hashes (cost factor 10), never plaintext.
- NFR-S2: JWT-based auth, 7-day expiry; admin endpoints require both a valid JWT and `role: admin`.
- NFR-S3: API accepts browser requests only from allow-listed origins (`www.mittalcollections.com`, `mittalcollections.com`, localhost dev ports) — enforced via CORS; not applicable to server-to-server calls (e.g. the cron scheduler).
- NFR-S4: Standard security headers via `helmet` (HSTS, X-Frame-Options, X-Content-Type-Options, etc.); CSP disabled (pure JSON API, no HTML to protect) and `Cross-Origin-Resource-Policy` explicitly set to `cross-origin` so the frontend can still load legacy same-server-hosted images.
- NFR-S5: `/api/auth/*` is rate-limited (20 requests / 15 minutes / IP) to slow credential brute-forcing.
- NFR-S6: File uploads are restricted by MIME type (images: jpg/jpeg/png/webp; product media additionally allows mp4/webm/mov) and size (5MB images, 20MB product video).
- NFR-S7: Scheduler-only endpoints (abandoned-cart reminders, points expiry) are protected by a shared secret query parameter, not JWT, since they're called by an external cron service rather than a logged-in user.
- NFR-S8: No secrets committed to the repository; all credentials live in `.env` (gitignored) / hosting-provider environment variables.
- **Known gap (deliberately deferred):** `cloudinary` is pinned at v1.41.3, which has a disclosed high-severity vulnerability (GHSA-g4mf-96x5-5m2c). Upgrading to v2 is a breaking change requiring a full re-test of every upload flow; tracked as a pending item, not yet scheduled.

### 2.3 Availability / Reliability
- NFR-A1: Backend runs on Render's free tier, which sleeps after inactivity and cold-starts on the next request — acceptable for current traffic; noted as a constraint, not a defect.
- NFR-A2: Scheduled jobs (abandoned cart, points expiry) run via an external scheduler (cron-job.org) rather than in-process, since an in-process scheduler would not survive Render's sleep/wake cycle.
- NFR-A3: Order placement is transactionally safe at the stock level — stock is reserved per item with automatic rollback of already-reserved items if any single item fails, so an order is never partially created against insufficient stock.

### 2.4 Usability / Accessibility
- NFR-U1: Fully responsive (mobile-first Tailwind breakpoints); verified against narrow (≤375px) viewports for floating UI elements (WhatsApp button, Compare bar, Back-to-top).
- NFR-U2: All meaningful images carry descriptive `alt` text (audited; the homepage hero banner was migrated from a CSS `background-image`, which cannot carry alt text, to a real `<img>` for this reason).
- NFR-U3: Both light and (where styled) dark-friendly, high-contrast UI conventions; toast notifications for all async actions (cart, wishlist, forms).

### 2.5 SEO
- NFR-SEO1: Every public page must set a unique `<title>` and meta description.
- NFR-SEO2: Structured data must reflect what's actually visible on the page (e.g. breadcrumb schema is paired with a matching visible breadcrumb trail, not schema-only).
- NFR-SEO3: `sitemap.xml` must be regenerated on every frontend build so new content (products, articles, categories) is always included.

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
