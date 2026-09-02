import { defineConfig, devices } from "@playwright/test";

// Targets the already-running local dev servers (client on 5173, API
// on 5000) rather than spawning them itself — this repo's client and
// server are separate npm packages with their own lifecycles (see
// DEPLOYMENT.md §5), and CI/local dev is expected to already have
// both running before this suite executes.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // several tests share seeded fixture data via the API
  // Hard-pinned rather than left to Playwright's own CPU-based default
  // — this suite runs against `vite dev`, not a production build, so
  // concurrent workers each trigger Vite's on-demand compile for
  // whatever route they hit first, and the dev server chokes trying to
  // compile several routes at once. Confirmed 2026-09-02: GitHub
  // Actions' runner picked 2 workers on its own and nearly the entire
  // suite failed/timed out from that pileup, retries included (a retry
  // doesn't help when the other worker is still hammering the dev
  // server) — pinning to 1 worker fixed it.
  workers: 1,
  // One retry on CI only, for the rare one-off blip that isn't a
  // concurrency pileup — a genuinely broken assertion fails the same
  // way on retry too, so this doesn't mask real bugs.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Matches the ≤375px threshold called out in TEST_PLAN.md for
      // floating UI elements (Compare bar, WhatsApp button, Back-to-top).
      name: "mobile-375",
      use: { viewport: { width: 375, height: 740 } },
    },
  ],
});
