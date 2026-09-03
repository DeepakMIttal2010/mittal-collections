# Deployment Guide

**Document version:** 1.5
**Last updated:** 2026-09-03

## 1. Hosting Summary

| Component | Provider | Plan | URL |
|---|---|---|---|
| Frontend | Vercel | — | https://www.mittalcollections.com |
| Backend API | Render | Free tier (sleeps on inactivity) | https://mittal-collections-api.onrender.com |
| Database | MongoDB Atlas | — | (connection string in `MONGODB_URI`) |
| Media storage | Cloudinary | — | |
| Transactional email | Brevo | — | HTTP API, not SMTP |
| Scheduled jobs | cron-job.org | Free | External HTTP-triggered cron |

Both Vercel and Render deploy automatically from the `main` branch of
the GitHub repo — there is no manual "click deploy" step once code is
pushed.

## 2. Git Workflow

`main` is protected by a GitHub ruleset (Settings → Rules → `main`,
added 2026-09-03) — direct pushes are rejected outright
(`GH013: Repository rule violations`). Every change lands via a pull
request, gated on three required status checks — `server-tests`,
`client-build`, `e2e-tests` (see `.github/workflows/ci.yml`) — all
passing. Required approvals is set to 0: the PR requirement itself is
the gate, not a second reviewer, so whoever opens the PR can merge it
themselves once CI is green.

Standard flow for a change:

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description   # or fix/short-description
# ...make changes, commit...
git push origin feat/short-description
```

Then open a pull request against `main` on GitHub. This does two
things automatically:
- Triggers CI on the PR itself (the same three checks).
- Triggers a Vercel preview deployment at its own throwaway URL, so
  the frontend change can be reviewed live before it ever reaches
  production — look for Vercel's bot comment on the PR with the link.

Once all three checks pass, merge the PR from GitHub's UI — that push
to `main` is what triggers the real Vercel + Render production
deploy.

Dependabot (`.github/dependabot.yml`) opens its own PRs weekly for
outdated/vulnerable dependencies across `server/`, `client/`, `e2e/`,
the root `package.json`, and the GitHub Actions versions in
`.github/workflows/*.yml` — these go through the exact same flow
above (CI-gated, no special-casing), so reviewing one just means
checking that CI is green and skimming the changelog for anything
that looks risky before merging.

CodeQL (`.github/workflows/codeql.yml`) scans the actual code —
not dependency versions like Dependabot, but real vulnerability
patterns (injection, XSS, etc.) — on every push/PR to `main` and
weekly on a schedule. Free on public repos. Findings show up under the
repo's **Security → Code scanning alerts** tab, not as a required PR
check, so it never blocks a merge — it's worth a glance there
periodically rather than something to react to per-PR.

`feature/deployment` predates this ruleset (it used to be where
day-to-day work happened, merged into `main` directly) and remains
unprotected — pushable directly, no PR needed — but no longer has a
real purpose under the PR-based flow above; it's being kept in sync
for continuity rather than actively relied on. Worth revisiting
whether to retire it once the new flow has proven itself for a while.

`git push` to GitHub occasionally fails with a transient
`Could not resolve host: github.com` DNS error — this is a local
network blip, not a real failure; simply retry the same command.

## 3. Environment Variables (Backend — `server/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Express listen port (Render overrides this itself in production) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Signs/verifies auth tokens |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Media uploads |
| `BREVO_API_KEY` | Transactional email HTTP API |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | Sender identity for outgoing email |
| `CLIENT_URL` | Used to build links inside emails (e.g. "View your order") |
| `CRON_SECRET` | Shared secret checked by the scheduler-only endpoints. **Usage expanded 2026-08-24, then again 2026-08-26**: now guards four endpoints — `/api/cart/send-abandoned-reminders`, `/api/rewards/expire-points`, `/api/orders/send-review-requests`, and `/api/wishlist/send-price-drop-alerts` — see §4.4. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Single-line JSON service-account key, powers `/api/admin/reports/google` (GA4 + Search Console data in Admin Reports). Optional — the endpoint degrades to a quiet "unavailable" message if unset. See §4.6. |
| `GOOGLE_OAUTH_CLIENT_ID` | Verifies Google ID tokens server-side for `POST /api/auth/google` (Google Sign-In / Sign-Up). **Required** for Google Sign-In to work; added 2026-08-08. |
| `RAZORPAY_KEY_ID` | Razorpay Standard Checkout — creates the Razorpay order server-side and is served to the frontend at order-creation time to open the checkout modal (not baked into the client build). **Required** for online payments. Added 2026-08-22. See §4.7 — confirmed working in **test mode** only as of that date; verify live-mode credentials before relying on this in production. |
| `RAZORPAY_KEY_SECRET` | Verifies the Razorpay payment signature (HMAC-SHA256) on `POST /api/orders/verify-payment`. Server-side only, never exposed to the client. **Required** for online payments. Added 2026-08-22. |
| `WHATSAPP_VERIFY_TOKEN` | Gates `GET /api/whatsapp/webhook` — must match the Verify Token entered in Meta's dashboard Callback URL setup. **Required** once the Meta webhook is configured (live and verified as of 2026-08-25). See §4.8. |
| `ADMIN_NOTIFICATION_EMAIL` | BCC destination on the registration OTP email, the post-verification welcome email, and every order-status-change email; also implicitly the audience for review-request send activity. Optional — emails still send fine without it, the admin just loses BCC visibility into what customers are receiving. Added 2026-08-24. |

**Not yet used by any code in this repo** (reserved for a future WhatsApp *sending* integration, not required today — see §4.8): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. Do not set these expecting current behavior to change; only `WHATSAPP_VERIFY_TOKEN` is actually read by the server as of 2026-08-25.

`.env` is gitignored — set the same keys/values in Render's dashboard
environment variable settings for production. Never commit real
values.

The frontend has no required env vars beyond what's baked into
`client/src/services/api.js` (the API base URL) — no `.env` is
currently used client-side for environment switching.

## 4. External Service Setup (one-time)

### 4.1 MongoDB Atlas
Cluster + database user already provisioned; connection string lives
only in env vars. If the IP-access list is restrictive, add whatever
IP is running scripts against it (Render's outbound IPs are dynamic on
the free tier, so Atlas access is typically left open to `0.0.0.0/0`
for the app to connect reliably — tighten this if the plan changes).

### 4.2 Cloudinary
Used for all new image/video uploads (products, categories, banners,
article covers). Legacy pre-Cloudinary assets are still served from
Render's own `/uploads` static folder — both paths are supported by
the client's `imgUrl()` helper.

### 4.3 Brevo (Email)
**Why not SMTP:** Render's free tier blocks all outbound SMTP (verified
directly — both port 465 and 587 time out). `server/config/mailer.js`
calls Brevo's HTTPS API instead (`POST https://api.brevo.com/v3/smtp/email`),
which works fine since it's a normal HTTPS request. The sending domain
(`mittalcollections.com`) is authenticated in Brevo via DNS records at
the domain registrar.

### 4.4 cron-job.org (Scheduled Jobs)
Four jobs (three confirmed set up on the cron-job.org dashboard; the
fourth is new and needs the same one-time dashboard setup + a real
triggered-run confirmation before relying on it). **Method no longer
matters** — every endpoint accepts both GET and POST as of 2026-08-13.
(History: the first two were originally POST-only, and cron-job.org
defaults every new job to GET with no reliable way to change it, so
both jobs had likely 404'd on every single scheduled run since
inception without anyone noticing. Fixed by making the endpoints
accept either method, so this class of bug can't recur — new jobs can
be left on cron-job.org's GET default.)

| Job name | URL | Schedule | Notes |
|---|---|---|---|
| Abandoned Cart Reminders | `https://mittal-collections-api.onrender.com/api/cart/send-abandoned-reminders?secret=<CRON_SECRET>` | Hourly | |
| Rewards Expire Points | `https://mittal-collections-api.onrender.com/api/rewards/expire-points?secret=<CRON_SECRET>` | Daily | |
| Post-Delivery Review Request | `https://mittal-collections-api.onrender.com/api/orders/send-review-requests?secret=<CRON_SECRET>` | Daily | **New 2026-08-24, confirmed set up on cron-job.org 2026-08-25.** Emails a review request for each Delivered order 8+ days past delivery that hasn't been emailed yet. |
| Wishlist Price-Drop Alerts | `https://mittal-collections-api.onrender.com/api/wishlist/send-price-drop-alerts?secret=<CRON_SECRET>` | Daily (suggested — matches the other content-driven jobs above) | **New 2026-08-26. Not yet confirmed set up on the cron-job.org dashboard** — the endpoint itself works (verified server-side), but someone with dashboard access needs to add the job and trigger one real run to confirm end-to-end, same as the review-request row above. |

If a run shows "Failed (output too large)" in cron-job.org's execution
history, check the endpoint directly with `curl` first — both
endpoints normally return a small, fixed-shape JSON response
regardless of how many records they process, so a large/unexpected
response usually indicates a transient platform issue rather than an
application bug. Confirm by re-hitting the URL manually and checking
the next scheduled run.

### 4.5 Domain / DNS
Domain registered externally (Namecheap); DNS records point the apex
and `www` to Vercel, plus TXT/CNAME/MX records for Brevo email
authentication.

### 4.6 Google Analytics 4 + Search Console (Admin Reports integration)
`server/controllers/googleReportsController.js` pulls live GA4 and
Search Console data into Admin Reports via a Google Cloud service
account (project `mittal-collections-reporting`):

1. Google Cloud Console → enable **Google Analytics Data API** and
   **Google Search Console API**.
2. Create a service account (e.g. `reporting-bot`) → Keys → **Create
   new key → JSON** → download it.
3. In GA4 (Admin → Property access management), add the service
   account's email as **Viewer/Analyst** on the correct property.
   **Watch for this:** the GA4 property may live under a *different*
   Google account than the one used for Search Console/domain
   ownership — logging into the wrong account shows an empty "Start
   measuring" onboarding screen instead of the real property, which
   looks like GA4 was never set up when it actually was.
4. In Search Console (Settings → Users and permissions), add the same
   service account email as a **Restricted** user.
5. Put the entire downloaded JSON as a single-line string in the
   `GOOGLE_SERVICE_ACCOUNT_KEY` env var (local `.env` and Render). The
   GA4 Property ID and Search Console site URL are hardcoded as
   constants in `server/config/googleReporting.js` — update them there
   if the property/site ever changes.

### 4.7 Razorpay (Online Payments)
Integrated 2026-08-22; made the default payment method at checkout
2026-08-24 (previously COD was default).

1. Create/log into a Razorpay account and generate API keys
   (Dashboard → Settings → API Keys).
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `server/.env`
   (local) and Render's dashboard (production).
3. No client-side env var is needed — the backend serves
   `RAZORPAY_KEY_ID` to the frontend at order-creation time rather
   than baking it into the client build.
4. **Current status: verified only in Razorpay test mode.** The
   integrating commit's own message states order creation was
   confirmed end-to-end to return a real Razorpay *test* order; no
   later commit confirms a switch to live-mode keys or a completed
   live transaction. Before treating this as production-ready:
   check the Razorpay dashboard for whether the configured keys are
   test (`rzp_test_...`) or live (`rzp_live_...`), and run one real
   low-value transaction end-to-end.
5. COD orders separately carry a `codCharge` (from
   `SiteSettings.codCharge`, admin-editable, default ₹50, meant to
   offset real courier COD-handling fees — the default is a
   placeholder pending Shiprocket onboarding). Razorpay orders never
   carry this charge.

### 4.8 WhatsApp Cloud API (Webhook Only)
Added 2026-08-25. Current scope is **receiving only** — there is no
message-*sending* integration in the codebase yet.

1. In the Meta Business dashboard (WhatsApp → Configuration), set the
   Callback URL to
   `https://mittal-collections-api.onrender.com/api/whatsapp/webhook`
   and choose a Verify Token.
2. Set that same value as `WHATSAPP_VERIFY_TOKEN` in `server/.env` /
   Render. Meta calls `GET /api/whatsapp/webhook` during setup; the
   endpoint echoes back `hub.challenge` only if the request's
   `hub.verify_token` matches.
3. `POST /api/whatsapp/webhook` receives message-status/incoming-message
   events and acknowledges immediately regardless of payload content
   (Meta disables webhooks that respond too slowly). Payload signature
   verification is not yet implemented.
4. Webhook is live and verified with Meta as of 2026-08-25. **Automated
   outbound messaging (order confirmations, status updates) is
   blocked** pending Meta Business Verification, which requires a
   business-name-matching document not yet available (Udyam
   re-registration pending with the government as of 2026-08-25).
5. Until that clears, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   and `WHATSAPP_BUSINESS_ACCOUNT_ID` are **not read by any code in
   this repo** — do not set them expecting current functionality to
   change. As an interim stand-in, the admin panel has a manual
   `wa.me` deep-link button per order (pre-fills a status-based
   message for the admin to review and send from their own WhatsApp)
   — see `docs/API.md`.

## 5. Local Development Setup

```bash
# Backend
cd server
npm install
# create .env with the variables from §3, pointing MONGODB_URI at a
# local MongoDB instance (mongodb://127.0.0.1:27017/mittal-collections)
npm run dev            # nodemon, restarts on file change

# Frontend
cd client
npm install
npm run dev             # Vite dev server, http://localhost:5173
```

The client talks to `http://localhost:5000/api` in dev by default. CORS
on the backend explicitly allow-lists `http://localhost:5173` (and
`:3000`) so local dev works against the local backend without any
extra configuration.

### Seeding local data
```bash
cd server
npm run seed:all        # categories, products, states, testimonials, pages, footer-links, banners, price-ranges, coupons
npm run seed:destroy    # wipe seeded data
```

## 6. Build & Deploy Verification

Before merging to `main`:
```bash
cd server && npm test          # order placement + loyalty points integration tests
cd client && npm run build     # must complete with no errors
                                 # (also regenerates public/sitemap.xml via the "prebuild" script)
```
After deploying, confirm both services are live:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mittal-collections-api.onrender.com/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://www.mittalcollections.com/
```
Both should return `200`. Render's free tier cold-starts after
inactivity, so the *first* request after a period of no traffic can
take up to ~30–60 seconds — this is expected, not a failure.

**A "push succeeded" is not proof the deploy happened.** Render's
auto-deploy-on-push has, at least once in practice, silently stopped
picking up new commits to `main` for several hours — no error
anywhere, the previous deploy just kept serving. The only reliable
check is hitting an endpoint that only exists in the new code and
confirming it responds as expected (e.g. a newly-added protected route
should 401, not 404 — a 404 on a route you just added, while an
older sibling route still 401s normally, means the *old* code is still
running). If that happens: open the Render dashboard for the service
→ **Manual Deploy** → **Deploy latest commit**.

**Vercel can silently block a deploy too, for a different reason.**
On the Hobby plan, if the git commit author doesn't have contributing
access to the Vercel project on a *private* GitHub repo, Vercel shows
the new deployment as **Blocked** in the Deployments tab — no email,
no error surfaced anywhere else. Fixed here by making the repo public
(removes the restriction); the Pro plan is the alternative if it needs
to stay private. Redeploying the *same* blocked deployment via the
dashboard's "Redeploy" button does **not** re-evaluate the block — a
fresh commit (an empty one is fine) is needed to trigger a new
deployment attempt after fixing the underlying cause.

## 6a. Backup & Recovery

MongoDB Atlas's free tier (M0, confirmed as this project's tier) has
no automated backup feature at all, so `.github/workflows/mongodb-backup.yml`
runs a weekly `mongodump` and stores it as a GitHub Actions artifact
(90-day rolling retention) instead. Requires a `MONGODB_URI` repository
secret (Settings → Secrets and variables → Actions) to actually run —
see `BACKUP_RECOVERY.md` for full setup and restore instructions.

**Known incident (2026-08-15, resolved):** this workflow showed green
in GitHub Actions for a week while actually producing empty
(~112–288 byte) archives. Root causes: `mongodump` without `--db`
needs `listDatabases` privilege, and — the real culprit — the
`MONGODB_URI` secret had a trailing newline baked in, corrupting the
database name inside the URI. Fixed by trimming trailing
whitespace/CR/LF before use; a real restore was rehearsed afterward
(2,123 documents, 0 failures). Takeaway documented in
`BACKUP_RECOVERY.md`: a green checkmark on this workflow is not proof
of a usable backup — periodically verify by actually attempting a
restore.

**Weekly Cloudinary asset backup** (`.github/workflows/cloudinary-backup.yml`,
added 2026-08-15, Sunday 04:00 UTC) mirrors the same pattern for media
assets via the Cloudinary Admin API. Requires `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as **GitHub repo
secrets** (same values as `server/.env`) — this is a separate,
manual, one-time step from setting them as the app's own runtime env
vars in Render.

## 7. Rollback

There is no automated rollback pipeline. To revert a bad deploy:
```bash
git checkout main
git revert <bad-commit-sha>     # or reset to a known-good commit
git push origin main            # re-triggers Vercel + Render deploy
```
Database changes made via one-off scripts (see below) are **not**
covered by git revert — they must be manually undone if needed.

## 8. One-Off Data/Migration Scripts

Occasional maintenance (seeding new content, backfilling a field,
fixing stale data) is done via small, throwaway Node scripts placed
directly in `server/` (not the scratch/temp directory — local
`node_modules` resolution requires it) and deleted immediately after
running. Pattern:
```js
import "dotenv/config";                 // must be first
import mongoose from "mongoose";
// ...import the relevant model(s)...

const uri = process.env.TARGET_URI      // override to target production
  || "mongodb://127.0.0.1:27017/mittal-collections";
await mongoose.connect(uri);

// ...do the one-off work...

process.exit(0);
```
Run against local by default, or against production with:
```bash
TARGET_URI="<production MongoDB Atlas URI>" node script.mjs
```
Always confirm the target (local vs. production) before running
anything that writes data, and delete the script afterward.
