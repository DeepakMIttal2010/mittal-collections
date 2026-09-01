# Mittal Collections — Client

React 19 + Vite storefront and admin panel. See `../docs/` for the
full documentation set (`ARCHITECTURE.md` for how this fits together
with the backend, `DEPLOYMENT.md` for environment variables and the
release process).

## Setup

```bash
npm install
npm run dev   # http://localhost:5173
```

`VITE_API_URL` (set via `.env.local`, gitignored — no `.env.example`
template exists yet) controls which backend the app talks to; it falls
back to `http://localhost:5000` (`src/services/api.js`) if unset.
Pointing it at the
production API instead (`https://mittal-collections-api.onrender.com`)
is also a valid local setup — useful for browsing real data without
seeding a local database — but be aware any write actions (login,
adding to cart, submitting a review, etc.) then hit the real production
backend and database, not a disposable local one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (also regenerates `public/sitemap.xml` via the `prebuild` step, see `scripts/generate-sitemap.js`) |
| `npm run lint` | ESLint over the whole project |
| `npm run preview` | Serve the last production build locally |

## Structure

See `../docs/ARCHITECTURE.md` §2-3 for the full repository layout and
frontend architecture (routing/code-splitting, state management via
React Context, data fetching, SEO layer). Briefly:

- `src/pages/` — one component per route; `src/pages/admin/` for the
  admin panel (lazy-loaded as its own bundle, never reaches a regular
  shopper's browser)
- `src/components/` — reusable UI pieces
- `src/context/` — `AuthContext`, `CartContext`, `WishlistContext`,
  `CompareContext`, `LanguageContext`
- `src/services/` — one file per backend resource, thin `fetch()` wrappers
- `src/utils/` — pure helpers with no React/DOM dependency

## Testing

Unit/integration tests live on the backend (`../server/tests/`).
Browser-level testing of this app is a separate Playwright package at
`../e2e/` — see `../e2e/README.md` for setup and running instructions.
