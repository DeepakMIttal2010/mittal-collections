# Backup & Recovery

**Status:** Audited 2026-08-08, then actually rehearsed end-to-end 2026-08-15 — which caught a real bug the 2026-08-08 audit missed (see §2.1.1). Cluster `Cluster0` is confirmed M0 (free tier, no backup feature). The `MONGODB_URI` repo secret is set, the backup workflow now produces a genuinely restorable archive, and this has been **verified by actually downloading and restoring one** (2,123 real documents, 0 failures), not just by the Actions tab showing green. Cloudinary (also Free tier, no backup feature) got the same weekly-backup treatment the same day — see §3.
**Document version:** 1.3
**Last updated:** 2026-08-15

## 1. Summary

| Data | Backed up? | Confidence |
|---|---|---|
| **MongoDB Atlas (orders, users, products, everything)** | **Yes, verified by real restore as of 2026-08-15** — weekly automated `mongodump` via GitHub Actions | High |
| Application code | Yes — GitHub, full history | High |
| Legacy `/uploads/*` images (pre-Cloudinary) | Yes — committed to git, not runtime-written | High |
| New product/category/banner/article media (Cloudinary) | **Yes, as of 2026-08-15** — weekly `backup-cloudinary.js` via GitHub Actions, verified locally (353 real assets, 260.9 MB, spot-checked as valid files) before deploying; needs a one-time GitHub secret setup, see §3 | High once secrets are added |
| Environment variables / secrets (JWT secret, API keys) | Unknown — only confirmed to exist in Render's dashboard | Needs manual confirmation |
| Recovery procedure (how to actually restore) | Documented below (§2.3), rehearsed for real 2026-08-15 | High (Mongo); Cloudinary restore is just re-uploading the downloaded files, not yet rehearsed |

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

### 2.1.1 A green checkmark was not enough — found 2026-08-15

The 2026-08-08 confirmation above was based on the Actions step
showing "Success". That was misleading: **every backup run from
2026-08-08 through 2026-08-15 produced an archive of ~112-288 bytes —
essentially empty.** `mongodump` was completing in ~4 seconds with no
output and exiting 0, so the workflow had nothing to fail on.

Root cause: the `MONGODB_URI` repo secret has a trailing newline
baked into it, so `mongodump` (without an explicit `--db`) was
targeting a database literally named `mittal-collections\n` — which,
being a nonsense name nothing had ever written to, was empty. The
step never errored because there was nothing to error on.

**Fix** (`.github/workflows/mongodb-backup.yml`): the workflow now
strips trailing whitespace/CR/LF from `$MONGODB_URI` before use, and
passes `--db="mittal-collections"` explicitly so a future URI problem
fails loudly instead of silently dumping nothing. Verified by
triggering a fresh on-demand run, downloading the resulting artifact,
and doing a real (non-dry-run) restore into a disposable local
database: **2,123 documents restored across 33 collections, 0
failures** — real products, page visits, users, categories, etc.

**The actual lesson, worth repeating:** *"the Actions tab shows a
green checkmark" is not verification that a backup is real.*
`mongodump`/`mongorestore` can both complete successfully while moving
zero data if the target database name is wrong. The only real
verification is periodically doing what finally caught this: download
the artifact and actually restore it somewhere, then check document
counts are non-zero and match expectations. See §2.3 for the restore
procedure — that's now been rehearsed for real, not just documented.

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

This restore procedure was rehearsed end-to-end 2026-08-15 (restored
into a throwaway local database, 2,123 documents across 33
collections, 0 failures — see §2.1.1) — it's a real, working
procedure, not just a written plan.

## 3. Cloudinary media

**RESOLVED 2026-08-15.** Confirmed via the Admin API's `/usage`
endpoint that this account is on the **Free plan** — same situation
as MongoDB Atlas's M0 tier, no automated backup feature at all.
Product/category/banner/article images and videos previously lived
only in Cloudinary with no secondary copy.

**What's now in place:** `.github/workflows/cloudinary-backup.yml`
runs `server/scripts/backup-cloudinary.js` every Sunday at 04:00 UTC
(an hour after the MongoDB backup, `workflow_dispatch` also available
for on-demand runs). The script pages through every image and video
resource via the Cloudinary Admin API and downloads the actual file
bytes, uploaded as a 90-day GitHub Actions artifact — same shape as
the MongoDB backup.

**Verified before deploying, not just assumed to work:** ran the
script locally against the real production Cloudinary account first —
353 real assets (285 product images + Cloudinary's own default sample
images + 8 videos), 260.9 MB total, spot-checked several with `file`
to confirm they're genuine JPEG/MP4 data (not empty or corrupted).
This caution is directly because of what was found in §2.1.1 the same
day — a green Actions checkmark is not proof a backup is real.

**One-time setup required (needs repo access):** add three repository
secrets — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` (same values as `server/.env`) — via GitHub →
**Settings** → **Secrets and variables** → **Actions**. Without them
the workflow fails cleanly with a clear error rather than silently
doing nothing. **Not yet done** — the workflow exists and was proven
to work locally, but no run has happened in CI yet because these
secrets haven't been added.

**Restoring:** download the artifact from the Actions tab, unzip it —
it's a plain folder of files (`image/<public_id>.<ext>`,
`video/<public_id>.<ext>`) ready to re-upload to Cloudinary or serve
directly if needed. Not yet rehearsed as an actual restore (unlike the
MongoDB one), since re-uploading to Cloudinary isn't destructive to
test whenever needed.

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
   working (2026-08-08).
2. ~~Do one rehearsal restore (§2.3) into a throwaway local database~~ —
   done 2026-08-15, and it's *why* the empty-backup bug above was
   caught in the first place — a real restore into a throwaway local
   DB, not just checking Actions for a checkmark.
3. ~~Consider whether Cloudinary needs the same backup treatment~~ —
   done 2026-08-15, see §3. **Still needed:** add the three
   `CLOUDINARY_*` repository secrets (§3) — the workflow won't run for
   real until that one-time step happens.
4. Confirm env vars/secrets (§5) have a record somewhere outside
   Render's dashboard.
5. Periodically repeat the real-restore check (§2.1.1), not just glance
   at the Actions tab — e.g. next time a risky migration is about to
   run, or every few months as a habit. Once the Cloudinary secrets are
   added, do the same for a Cloudinary backup at least once too.
6. (Optional) If the store outgrows the free tier's 512 MB cap or the
   weekly backup cadence stops feeling sufficient, revisit upgrading
   to Atlas M10+ for real continuous/point-in-time backups instead of
   the GitHub Actions workaround.
