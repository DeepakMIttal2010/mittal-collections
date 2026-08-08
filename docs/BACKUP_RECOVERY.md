# Backup & Recovery

**Status:** Audited 2026-08-08 — likely a real gap on the database, everything else checked out okay or is lower-risk. Nothing here was previously documented anywhere in this repo.
**Document version:** 1.0
**Last updated:** 2026-08-08

## 1. Summary

| Data | Backed up? | Confidence |
|---|---|---|
| **MongoDB Atlas (orders, users, products, everything)** | **Almost certainly not** | Needs manual confirmation in the Atlas dashboard — I can't check it myself |
| Application code | Yes — GitHub, full history | High |
| Legacy `/uploads/*` images (pre-Cloudinary) | Yes — committed to git, not runtime-written | High |
| New product/category/banner/article media (Cloudinary) | No local copy; relies entirely on Cloudinary's own durability | Medium |
| Environment variables / secrets (JWT secret, API keys) | Unknown — only confirmed to exist in Render's dashboard | Needs manual confirmation |
| Recovery procedure (how to actually restore any of the above) | Doesn't exist | — |

The database is the one that matters most — it holds every order,
every customer account, every loyalty point balance. Everything else
in this stack (code, legacy images) is either replaceable or already
safe; the database is the item worth resolving first.

## 2. MongoDB Atlas — the real risk

This project's `MONGODB_URI` is an Atlas `mongodb+srv://` connection
string. **MongoDB Atlas's free tier (M0) has no automated backups and
no SLA at all** — backup/point-in-time-restore is only available
starting at the M10 dedicated tier (paid, roughly $58+/month for
compute alone). [Source](https://www.srvrlss.io/provider/mongodb/)

Given every other piece of this stack is deliberately on a free tier
(Render free web service, cron-job.org free scheduler), **it's likely
this Atlas cluster is also M0** — but I have no way to confirm that
myself; it needs to be checked directly in the Atlas dashboard.

**If it is M0: there is currently zero backup of the production
database.** A cluster deletion, a bad migration script, an accidental
`deleteMany({})` in the wrong environment, or Atlas-side data loss
would be unrecoverable. Given this is a live store processing real
Cash-on-Delivery and Razorpay-labeled orders with real customer PII
(names, addresses, phone numbers), this is worth resolving.

### What to check
1. Atlas dashboard → the cluster → confirm the tier (M0/M2/M5 = shared,
   no backup; M10+ = dedicated, backups available).
2. If M0 and staying on it for cost reasons, backups need to be taken
   **manually** instead — see options below.
3. If upgrading to M10+ is acceptable, enable Cloud Backup in the
   cluster settings and set a retention policy.

### Manual backup option (works on any tier, including M0)
`mongodump` can export the whole database to a local/portable archive
without needing Atlas's paid backup feature:
```bash
mongodump --uri="<MONGODB_URI>" --archive=backup-$(date +%Y%m%d).gz --gzip
```
This isn't a substitute for real automated backups (it's a manual
snapshot at a point in time, and a human has to remember to run it and
to store the output somewhere durable — not on the same machine as the
database), but it's a genuine, immediate option that costs nothing
and needs no plan change. A reasonable minimum: run this weekly (or
before any risky migration script — see `DEPLOYMENT.md` §8) and keep
the last several archives somewhere outside this machine (cloud
storage, another drive).

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

## 6. Recommended Next Steps (in priority order)

1. **Check the Atlas cluster tier.** This is the one that actually
   matters — everything else here is lower-stakes.
2. If M0 and staying there: start running manual `mongodump` backups
   on a schedule, store them off-machine.
3. If upgrading is acceptable: enable Atlas Cloud Backup.
4. Confirm env vars/secrets have a record somewhere outside Render's
   dashboard.
5. (Optional, lower priority) Consider whether Cloudinary's own
   backup/export features are worth enabling, given the single-sourced
   dependency noted in §3.

This document describes *what to check and why* — I don't have
dashboard access to MongoDB Atlas, Render, or Cloudinary myself, so
steps 1-4 need to be done directly by whoever has those logins.
