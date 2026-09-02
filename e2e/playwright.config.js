import { defineConfig, devices } from "@playwright/test";

// Targets the already-running local dev servers (client on 5173, API
// on 5000) rather than spawning them itself — this repo's client and
// server are separate npm packages with their own lifecycles (see
// DEPLOYMENT.md §5), and CI/local dev is expected to already have
// both running before this suite executes.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // several tests share seeded fixture data via the API
  // One retry on CI only — this suite runs against `vite dev`, not a
  // production build, so the first hit to any given route pays Vite's
  // on-demand compile cost; occasionally that pushes a single test past
  // its timeout (confirmed 2026-09-02: a test that took 42s and timed
  // out cold took 5.8s once the route was already compiled). A retry
  // absorbs that one-off cost without masking a genuinely broken
  // assertion, which fails the same way on retry too.
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
