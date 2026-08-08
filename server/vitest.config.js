import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 60000, // mongodb-memory-server can take a while to start
    // Each test file spins up its own mongodb-memory-server instance.
    // Running files in parallel means starting several mongod processes
    // at once, which reliably times out on a modest dev machine — run
    // files one at a time instead. The suite is small enough that this
    // costs a few seconds, not minutes.
    fileParallelism: false,
  },
});
