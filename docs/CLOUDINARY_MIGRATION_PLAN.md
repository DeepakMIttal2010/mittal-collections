# Cloudinary v1 → v2 Migration Plan

**Status:** Planning complete, execution deliberately held pending explicit go-ahead.
**Document version:** 1.0
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

## 6. What's Still Needed Before Executing

This document is the *plan* — execution itself is still deliberately
held. Before running it: block out time to do step 3's manual
re-verification properly (needs real Cloudinary credentials and
actually exercising each of the 5 upload flows, not just a code read),
since that's the part that actually de-risks this, not the version
bump itself.
