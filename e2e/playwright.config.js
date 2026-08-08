import { defineConfig, devices } from "@playwright/test";

// Targets the already-running local dev servers (client on 5173, API
// on 5000) rather than spawning them itself — this repo's client and
// server are separate npm packages with their own lifecycles (see
// DEPLOYMENT.md §5), and CI/local dev is expected to already have
// both running before this suite executes.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // several tests share seeded fixture data via the API
  retries: 0,
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
