# E2E Tests (Playwright)

Real-browser tests against the app as a user would actually experience
it — covers the parts of `docs/TEST_PLAN.md`'s manual checklist that
genuinely need a browser (popups, mobile layout, admin panel clicking,
notification bell UI, SEO markup) rather than an API-level check.

## Setup (one-time)

```bash
cd e2e
npm install
npx playwright install chromium --with-deps
```

## Running

**Both local dev servers must already be running** — this suite talks
to `http://localhost:5173` (client) and `http://localhost:5000` (API)
directly, it doesn't start them itself (see `DEPLOYMENT.md` §5 for how
to start each).

```bash
npm test          # desktop viewport
npm run test:mobile   # 375px viewport (matches TEST_PLAN.md's ≤375px threshold)
npm run test:all      # both
```

## How auth fixtures work

`tests/helpers.js` creates real test users via the API (`createTestUser`)
rather than going through the login form each time — faster, and
keeps tests independent. `createTestAdmin` does the same then flips
the user's role directly in the **local** MongoDB (connects to
`mongodb://127.0.0.1:27017/mittal-collections` directly — never used
against production; the register endpoint correctly hardcodes
`role: "user"` for security, this is a test-only bypass of that).

`loginAs(context, user)` injects the resulting JWT into `localStorage`
via `context.addInitScript` before any page script runs, so
`AuthContext` picks up an authenticated session on first render — no
need to click through the login form in tests that aren't specifically
testing login itself.

## A note on the auth rate limiter

`/api/auth/*` is rate-limited to 20 requests / 15 minutes / IP (by
design — see `SRS.md` NFR-S5). Each `createTestUser`/`createTestAdmin`
call costs 2-3 of those requests. Test files share one fixture user
across all their tests via `test.beforeAll` rather than creating a
fresh one per test, specifically to stay under this limit during a
full suite run. If you hit "Too many attempts" while iterating on
tests locally, restart the local server to clear the in-memory limiter
state (`express-rate-limit`'s default store resets on restart) — this
is the limiter working correctly, not a bug.

## Coverage

See `docs/TEST_PLAN.md` for which manual checklist items are covered
by which file here.
