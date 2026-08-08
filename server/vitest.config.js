import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 60000, // mongodb-memory-server can take a while to start
  },
});
