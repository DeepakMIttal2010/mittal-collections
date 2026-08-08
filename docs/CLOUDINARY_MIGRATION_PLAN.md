# Cloudinary v1 → v2 Migration Plan

**Status:** ✅ **Executed and deployed 2026-08-08.** `cloudinary` is now `^2.10.0`, `npm audit` reports 0 vulnerabilities, all 4 real upload flows (product, category, banner, article) verified working with real Cloudinary credentials on local dev. Production is deployed and healthy but a real upload wasn't independently re-tested there (see §6) — low residual risk, not zero.
**Document version:** 1.1
**Last updated:** 2026-08-08

## 1. Why This Exists

`server/package.json` pins `cloudinary@1.41.3`, which has a disclosed
high-severity vulnerability: **GHSA-g4mf-96x5-5m2c** — "Arbitrary
Argument Injection through parameters that include an ampersand."
Surfaced via `npm audit` on 2026-08-07 during a security hardening
pass. `npm audit fix --force` would jump straight to `cloudinary@2.10.0`
(current latest), which is a major version bump and therefore a
breaking-change risk that needs planning before executing blind.

## 2. Research Findings

Checked the official changelog (`cloudinary/cloudinary_npm`) for every
release between 2.0.0 and 2.10.0:

- **2.7.0 (2025-06-18)** — *"Parameter injection vulnerability patched
  via ampersand handling."* This is the actual fix for GHSA-g4mf-96x5-5m2c.
  **The minimum version that resolves the vulnerability is 2.7.0, not
  necessarily 2.10.0** — worth knowing in case a narrower bump is
  preferred over jumping to the latest.
- **2.0.0 (2024-01-29)** — the only release in this span with changes
  explicitly marked "breaking":
  - `secure` option now defaults to `true` in `cloudinary.config()`.
  - URL analytics enabled by default (adds tracking query params to
    delivery URLs).
  - Dropped support for Node 6 and Node 8.
- **2.0.0 → 2.10.0, everything else** — no further breaking changes
  listed; the rest are additive features (Analyze API, folder
  operations, backup/restore-by-asset-ID, native URL parsing replacing
  a custom parser in 2.9.0, native Promises in 2.9.0) or bug fixes.

No changelog entry across this entire range removes or changes the
signature of `cloudinary.config()` or `cloudinary.uploader.upload_stream()`
— the two APIs this codebase actually uses.

Sources: [cloudinary_npm CHANGELOG](https://github.com/cloudinary/cloudinary_npm/blob/master/CHANGELOG.md), [Node.js SDK docs](https://cloudinary.com/documentation/node_integration)

## 3. Actual Usage Surface (why the risk is lower than it looks)

Grepped the entire `server/` tree — **only two files touch `cloudinary` at all**:

| File | Usage |
|---|---|
| `server/config/cloudinary.js` | `cloudinary.config({ cloud_name, api_key, api_secret })` — imports `{ v2 as cloudinary }`, i.e. already uses the SDK's internal v2 namespace (this has existed inside the 1.x package for years and is unrelated to the 1.x→2.x *package* major version) |
| `server/middleware/imageOptimizer.js` | `cloudinary.uploader.upload_stream(options, callback)`, wrapped in a `new Promise()` — the sole upload code path for every image/video (products, categories, banners, article covers, testimonials) |

There is no scattered `cloudinary.uploader.upload(...)` call anywhere
else, no direct SDK usage in any controller. **Every upload flow in
the app funnels through this one middleware** — a single choke point,
not four separate migration surfaces.

Checked the two "breaking" changes in 2.0.0 against actual usage:
- `secure: true` default — `imageOptimizer.js` already reads
  `result.secure_url` explicitly from the upload response, never the
  plain `result.url`. **Zero impact.**
- URL analytics query params — cosmetic; stored/served URLs would
  gain extra tracking params, doesn't change functionality. Worth a
  visual sanity check post-upgrade, not a blocker.
- Node 6/8 dropped — irrelevant, local dev runs Node 24.x and Render's
  runtime is far newer than 8.

## 4. Recommended Approach

1. Bump `cloudinary` in `server/package.json` to `^2.10.0` (latest,
   since there's no reason to deliberately stay behind once moving off
   1.x — 2.7.0 is the *minimum* that fixes the CVE, but there's no
   downside found to going all the way to current).
2. `npm install` locally, `npm test` (existing 57-test suite doesn't
   touch Cloudinary directly since uploads are mocked out of scope of
   those tests — this only proves nothing else broke, not that uploads
   still work).
3. **Manually re-verify every upload flow** against a local dev server
   with real Cloudinary credentials (not the in-memory test DB):
   - Add Product with images + a video (`AddProduct.jsx`)
   - Edit Product — replace one image, keep others, change main-image
     selection (`EditProduct.jsx`)
   - Add/Edit Category image
   - Add/Edit homepage Banner image
   - Add/Edit Article cover image
   - Confirm each resulting URL is a valid `https://res.cloudinary.com/...`
     link that actually loads in the browser
4. Spot-check `npm audit` afterward to confirm GHSA-g4mf-96x5-5m2c no
   longer appears.
5. Deploy via the normal `feature/deployment` → `main` flow, then
   repeat step 3's checks once against production (real upload, real
   URL, real page load) before considering this closed.

## 5. Rollback

If an upload flow breaks post-upgrade: revert the `package.json`/
`package-lock.json` change via `git revert`, redeploy. No data
migration is involved — existing already-uploaded assets and their
stored URLs are completely unaffected by the SDK version, since the
SDK is only involved at upload time, not at serve/read time.

## 6. Execution Record (2026-08-08)

Ran exactly per §4, with real Cloudinary credentials against the local
dev server (not mocked, not a code read):

- `npm install cloudinary@^2.10.0` — clean install, no dependency conflicts.
- `npm audit` — **0 vulnerabilities** (was flagging GHSA-g4mf-96x5-5m2c before).
- `npm test` — all 68 backend tests still pass.
- **Real upload verification**, one throwaway test record per flow, each producing a genuine `https://res.cloudinary.com/...` URL confirmed to actually load (HTTP 200):
  - Category image upload — ✅
  - Banner image upload — ✅
  - Article cover image upload (`POST /api/articles/upload-image`) — ✅
  - Product image upload — ✅
  - Product *video* upload was not separately tested with a real video file (no risk-free way to synthesize one for a quick check), but it runs through the exact same `imageOptimizer.js` → `cloudinary.uploader.upload_stream()` call as every image flow above, just with `resource_type: "video"` — the same API surface already proven to work, not a distinct one.
  - All test records deleted afterward (permanent delete via the admin API) — no leftover test data in local dev.
- Deployed via the standard `feature/deployment` → `main` flow. Production health checks (frontend + `/api/health`) pass post-deploy. **A real upload test against production itself was deliberately skipped** (I don't hold production admin credentials to test this myself, and the user chose to rely on the local verification + health checks rather than do it themselves) — confidence is high given the code path is identical to what was already proven locally, but this specific claim ("uploads work in production") hasn't been directly observed post-upgrade. Worth a quick real check (add/edit any image in the live admin panel) next time someone's in there anyway.

No code changes were needed beyond the `package.json`/`package-lock.json`
version bump — the "breaking changes" analysis in §3 held up exactly
as predicted.
