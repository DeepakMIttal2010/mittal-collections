# Mittal Collections — Documentation

Full documentation set for the Mittal Collections e-commerce platform,
generated 2026-08-07, last refreshed 2026-09-01 to cover: product
returnability & trust badges, manual + auto Compare, WhatsApp/COD
badges, the Customer Support ticket system, the Return Request system
(including automated stock restore + loyalty clawback on approved
returns), IP/address-based "Deliver to" header, the Advanced Analytics
Dashboard (custom date range, growth %, CSV export, conversion funnel,
search analytics, cart abandonment, loyalty/referral performance), the
Notification Center (customer bell + admin bell extensions for
Tickets/Returns/low-stock), a welcome-popup fix, guest cart/wishlist
(with merge-on-login), review photo/video uploads with review-bonus
loyalty points, wishlist price-drop alerts, Hindi article pages, the
admin Product Engagement report (per-product views/wishlist/cart, with
guest-inclusive viewer drill-downs), a product-page pincode delivery
checker, a 163-test automated backend suite (`server/tests/`, 23
files), a 36-test Playwright browser suite (`e2e/`, 8 files), a fully
clean ESLint baseline, and a Cloudinary v1→v2 migration plan.

| Document | What's in it |
|---|---|
| [FRS.md](./FRS.md) | Functional Requirements — every customer and admin feature |
| [SRS.md](./SRS.md) | Software Requirements — tech stack, non-functional requirements (performance, security, availability) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, repo layout, data flow, deployment topology |
| [API.md](./API.md) | Every backend REST endpoint, grouped by resource |
| [DATABASE.md](./DATABASE.md) | Every MongoDB collection and its fields |
| [USER_MANUAL.md](./USER_MANUAL.md) | How to use the site as a customer |
| [ADMIN_MANUAL.md](./ADMIN_MANUAL.md) | How to run the store from the admin panel |
| [TEST_PLAN.md](./TEST_PLAN.md) | Automated test suite + manual regression checklist |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Hosting, env vars, release process, local setup |
| [CLOUDINARY_MIGRATION_PLAN.md](./CLOUDINARY_MIGRATION_PLAN.md) | Planned (not yet executed) v1→v2 SDK upgrade to fix a known vulnerability |
| [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) | Backup status per data store — flags a likely real gap on the production database |

These docs describe the system as of the date above. The codebase is
the source of truth — if something here looks stale, trust the code
and update this file.
