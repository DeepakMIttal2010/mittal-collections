# Backup & Recovery

**Status:** Audited and fixed 2026-08-08. Cluster `Cluster0` was confirmed M0 (free tier, no backup feature). The `MONGODB_URI` repo secret is now set and the backup workflow has a **confirmed successful run** (Actions run #2, "Success", 20s, 1 artifact produced).
**Document version:** 1.1
**Last updated:** 2026-08-08

## 1. Summary

| Data | Backed up? | Confidence |
|---|---|---|
| **MongoDB Atlas (orders, users, products, everything)** | **Yes, as of 2026-08-08** — weekly automated `mongodump` via GitHub Actions | High |
| Application code | Yes — GitHub, full history | High |
| Legacy `/uploads/*` images (pre-Cloudinary) | Yes — committed to git, not runtime-written | High |
| New product/category/banner/article media (Cloudinary) | No local copy; relies entirely on Cloudinary's own durability | Medium |
| Environment variables / secrets (JWT secret, API keys) | Unknown — only confirmed to exist in Render's dashboard | Needs manual confirmation |
| Recovery procedure (how to actually restore) | Documented below (§2.3), never yet rehearsed | — |

The database is the one that matters most — it holds every order,
every customer account, every loyalty point balance. Everything else
in this stack (code, legacy images) is either replaceable or already
safe.

## 2. MongoDB Atlas

### 2.1 Confirmed state

Checked directly in the Atlas dashboard (2026-08-08): cluster
`Cluster0` (AWS / Mumbai, 3-node replica set, MongoDB 8.0.29) shows
**Backups: Inactive** and a 512.00 MB storage cap — both confirm this
is an M0 free-tier cluster. M0/M2/M5 (shared tier) clusters have no
automated backup feature in Atlas at all; that only becomes available
on the M10+ dedicated tier (paid, roughly $58+/month for compute
alone). [Source](https://www.srvrlss.io/provider/mongodb/)

The user opted to stay on the free tier and cover this gap with a
scheduled `mongodump` instead of upgrading — see below.

### 2.2 What's now in place

`.github/workflows/mongodb-backup.yml` — a GitHub Actions workflow
that:
- Runs every **Sunday at 03:00 UTC** (~8:30 AM IST), and can also be
  triggered on demand from the repo's **Actions** tab
  ("MongoDB Backup" → **Run workflow**) — e.g. right before running a
  risky one-off migration script (`DEPLOYMENT.md` §8)
- Installs the official MongoDB Database Tools, runs `mongodump`
  against the production `MONGODB_URI`, and uploads the resulting
  `.gz` archive as a build artifact
- Artifacts are kept for **90 days** (roughly the last 12-13 weekly
  runs), then auto-expire — a rolling window, not unbounded storage

**One-time setup required (not done automatically — needs repo
access):** add a repository secret named `MONGODB_URI` with the
production connection string. GitHub → the repo → **Settings** →
**Secrets and variables** → **Actions** → **New repository secret**.
Without this, the workflow runs and fails cleanly with a clear error
rather than silently doing nothing.

### 2.3 How to restore from a backup

1. GitHub → repo → **Actions** tab → **MongoDB Backup** workflow →
   pick the run to restore from → download the
   `mongodb-backup-<run-id>` artifact (a `.zip` containing the `.gz`
   archive).
2. Restore into a target database (**never restore directly into the
   live production database without a plan** — restore into a fresh
   test cluster/local MongoDB first and verify, unless this is a true
   emergency):
   ```bash
   mongorestore --uri="<target MONGODB_URI>" --archive=mittal-collections-backup.gz --gzip
   ```
3. `mongorestore` merges/adds by default — it does not wipe existing
   collections first. For a full point-in-time recovery (replacing
   current data entirely), add `--drop` so each collection is dropped
   before being restored from the archive. **Never run `--drop`
   against production without being certain that's what's intended.**

This restore procedure has not been rehearsed end-to-end — the first
real test of it should ideally be a deliberate drill (restore into a
throwaway local database and confirm the data looks right), not the
first time it's tried during an actual incident.

## 3. Cloudinary media

New uploads (product/category/banner/article images and product
videos) live only in Cloudinary — there's no local or secondary copy.
Cloudinary is a large, established provider and account-level data
loss is a low-probability event, but it's not zero: account
suspension (e.g. a billing issue) or accidental deletion via the
Cloudinary console would have no fallback today. Lower priority than
the database, but worth knowing this dependency is single-sourced.

## 4. Legacy `/uploads/*` images

Checked directly: these 33 files are **committed to git**
(`git ls-files server/uploads` confirms it), not written at runtime.
That means they're safe from Render's free-tier ephemeral filesystem
(which wipes anything not baked into the deployed build) and are
already effectively backed up via GitHub, same as the code. No action
needed here — this was worth verifying but isn't a gap.

## 5. Secrets / environment variables

`JWT_SECRET`, `CLOUDINARY_API_SECRET`, `BREVO_API_KEY`, `MONGODB_URI`,
`CRON_SECRET`, etc. exist in Render's dashboard environment variable
settings (per `DEPLOYMENT.md` §3) and in a local `.env` (gitignored,
so not backed up by git by design — correctly, since it shouldn't be).
**Worth confirming:** is there a secure record of these values kept
anywhere outside Render's dashboard (a password manager, a sealed
note)? If Render access were ever lost, regenerating `JWT_SECRET`
would silently invalidate every logged-in user's session (forcing
re-login, not data loss) — annoying but recoverable. Losing the
Cloudinary/Brevo/MongoDB credentials without a record elsewhere would
be a bigger problem since those point at *other* services' actual
data, not just this app's own state.

## 6. Remaining Next Steps

1. ~~Add the `MONGODB_URI` repository secret~~ — done, verified
   working (2026-08-08, Actions run #2, Success).
2. Confirm env vars/secrets (§5) have a record somewhere outside
   Render's dashboard.
3. Do one rehearsal restore (§2.3) into a throwaway local database, so
   the first time this procedure is used isn't during a real incident.
4. (Optional, lower priority) Consider whether Cloudinary's own
   backup/export features are worth enabling, given the single-sourced
   dependency noted in §3.
5. (Optional) If the store outgrows the free tier's 512 MB cap or the
   weekly backup cadence stops feeling sufficient, revisit upgrading
   to Atlas M10+ for real continuous/point-in-time backups instead of
   the GitHub Actions workaround.
