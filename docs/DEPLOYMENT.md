# Deployment Guide

**Document version:** 1.1
**Last updated:** 2026-08-08

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

Day-to-day work happens on `feature/deployment`; `main` is what's
actually live. The standard release sequence:

```bash
git checkout feature/deployment
# ...make changes, commit...
git push origin feature/deployment

git checkout main
git merge --ff-only feature/deployment
git push origin main        # triggers Vercel + Render auto-deploy

git checkout feature/deployment   # return to working branch
```

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
| `CRON_SECRET` | Shared secret checked by the two scheduler-only endpoints |

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
Two jobs, both **must be set to HTTP method POST** (cron-job.org
defaults new jobs to GET, which the endpoints reject):

| Job name | URL | Schedule |
|---|---|---|
| Abandoned Cart Reminders | `POST https://mittal-collections-api.onrender.com/api/cart/send-abandoned-reminders?secret=<CRON_SECRET>` | Hourly |
| Rewards Expire Points | `POST https://mittal-collections-api.onrender.com/api/rewards/expire-points?secret=<CRON_SECRET>` | Daily |

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

## 6a. Backup & Recovery

MongoDB Atlas's free tier (M0, confirmed as this project's tier) has
no automated backup feature at all, so `.github/workflows/mongodb-backup.yml`
runs a weekly `mongodump` and stores it as a GitHub Actions artifact
(90-day rolling retention) instead. Requires a `MONGODB_URI` repository
secret (Settings → Secrets and variables → Actions) to actually run —
see `BACKUP_RECOVERY.md` for full setup and restore instructions.

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
