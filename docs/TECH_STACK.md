# Technology Stack

**Project:** Mittal Collections
**Last updated:** 2026-09-17
**Source of truth:** `client/package.json`, `server/package.json`, `e2e/package.json`, `.github/workflows/` — this document is a curated read of those, not a separate list to keep in sync by hand. If a dependency is added/removed, update this file in the same PR.

For third-party *hosted services* (Vercel, Render, MongoDB Atlas, Cloudinary, Brevo, Razorpay, Google Merchant Center, Sentry, UptimeRobot, cron-job.org, etc.) see **`ARCHITECTURE.md` §6 (Deployment Topology)** — that table is the single source of truth for "what external services do we depend on and why." This document covers *code-level* technology: languages, frameworks and libraries.

---

## 1. Languages & Runtimes

- **JavaScript (ES Modules)** — both `client` and `server` use `"type": "module"`; no TypeScript in application code (client ships `@types/react`/`@types/react-dom` only for editor autocomplete, not a compiled `.ts` codebase).
- **Node.js** — backend runtime (Express 5 requires Node ≥18).
- **Browser** — React 19 SPA, no server-side rendering (see the bot-prerendering exception in `ARCHITECTURE.md` §4.9, which is a serverless function returning static HTML, not SSR of the app itself).

## 2. Frontend (`client/`)

| Purpose | Library | Version |
|---|---|---|
| UI framework | React + React DOM | 19.2.7 |
| Build tool / dev server | Vite | 8.2.2 |
| Styling | Tailwind CSS (via `@tailwindcss/vite`) | 4.3.3 |
| Routing | React Router DOM | 7.18.3 |
| SEO / document `<head>` management | react-helmet-async | 3.0.0 |
| Icons | react-icons | 5.7.0 |
| Toast notifications | react-toastify | 11.1.0 |
| Rich-text editor (admin product/article content) | react-quill-new | 3.8.3 |
| Virtualized product grids (large lists) | @tanstack/react-virtual | 3.14.11 |
| QR code generation (product-share cards, POS) | qrcode | 1.5.4 |
| CSV parsing (admin bulk import) | papaparse | 5.7.0 |
| Fixes missing duration metadata on browser-recorded video (product-share videos) | fix-webm-duration | 1.0.6 |
| Vercel Edge Middleware runtime types | @vercel/edge | 1.3.3 |
| Error tracking (client-side) | @sentry/react | 10.73.0 |

**State management:** no Redux/Zustand/Recoil — plain React Context (`AuthContext`, `CartContext`, `WishlistContext`, `CompareContext`), see `ARCHITECTURE.md` §3.2.

**Data fetching:** no React Query/SWR — plain `fetch()` wrappers per resource in `client/src/services/`, see `ARCHITECTURE.md` §3.3.

**Dev tooling:** ESLint 10 (`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`), `@vitejs/plugin-react`.

## 3. Backend (`server/`)

| Purpose | Library | Version |
|---|---|---|
| Web framework | Express | 5.2.1 |
| Database ODM | Mongoose (MongoDB) | 9.8.0 |
| Authentication tokens | jsonwebtoken | 9.0.3 |
| Password hashing | bcryptjs | 3.0.3 |
| Google Sign-In verification | google-auth-library | 11.0.0 |
| Google Analytics 4 / Search Console reporting API | googleapis | 176.0.0 |
| Media storage/CDN | cloudinary | 2.10.0 |
| Payments | razorpay | 2.9.8 |
| File upload handling | multer | 2.2.0 |
| Image resize/compression before upload | sharp | 0.35.3 |
| Security headers | helmet | 8.3.0 |
| CORS | cors | 2.8.6 |
| Rate limiting (`/api/auth`) | express-rate-limit | 8.6.2 |
| Response compression | compression | 1.8.1 |
| HTML sanitization (user-submitted rich text, e.g. reviews/articles) | sanitize-html | 2.17.7 |
| IP → country/city geolocation (bundled DB, falls back to ip-api.com) | geoip-lite | 2.0.3 |
| Error tracking (server-side) | @sentry/node | 10.73.0 |
| Env var loading | dotenv | 17.4.2 |

**Dev tooling:** ESLint 10, `nodemon` (dev auto-restart).

## 4. Testing

| Layer | Tool | Notes |
|---|---|---|
| Backend unit/integration | Vitest + Supertest | Against an in-memory MongoDB (`mongodb-memory-server`) — no real DB touched by tests. See `server/tests/`. |
| End-to-end (browser) | Playwright (`@playwright/test` 1.62.1) | Separate npm package (`e2e/`), runs against local dev servers (client `:5173`, API `:5000`). See `e2e/README.md`. |

Run: `npm test` (server, Vitest), `cd e2e && npm run test:all` (Playwright, all projects) / `npm test` (desktop Chrome only) / `npm run test:mobile`.

## 5. CI/CD (GitHub Actions, `.github/workflows/`)

| Workflow | Purpose |
|---|---|
| `ci.yml` | Runs the test suites (and presumably lint/build) on push/PR |
| `codeql.yml` | Static security analysis (CodeQL) — has caught real issues this project shipped with (a wishlist NoSQL-injection bug, an SSRF-pattern URL-building bug, an incomplete-URL-substring-sanitization bug) |
| `lighthouse.yml` | Automated performance/accessibility/SEO auditing |
| `cloudinary-backup.yml` | Weekly Cloudinary asset backup |
| `mongodb-backup.yml` | Weekly MongoDB backup |

## 6. Deployment

- **Frontend:** Vercel (static Vite build + one Edge Middleware function + one serverless function for bot-prerendering — see `ARCHITECTURE.md` §4.9).
- **Backend:** Render (free tier, Node process).
- **Database:** MongoDB Atlas.

Full detail, environment variables, and release process: `DEPLOYMENT.md`. Full external-service rationale/status: `ARCHITECTURE.md` §6.

## 7. Known dead weight

The **repository root** (`/package.json`, outside both `client/` and `server/`) lists `axios`, `bootstrap`, `react-icons` and `react-router-dom` as dependencies — grep-verified as **not imported anywhere** in either `client/src` or `server/`. This looks like a leftover from before the client/server split and isn't part of the real stack described above. Worth deleting in a follow-up rather than leaving it to confuse the next person who reads "what do we depend on" off the wrong `package.json`.
