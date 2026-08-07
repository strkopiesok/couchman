import { defineConfig } from "vitest/config";

// Integration tests talk to a real CouchDB (+ Clouseau). They either use an
// external server via COUCHMAN_IT_URL, or spin one up with testcontainers
// (needs Docker). Both are slow, so timeouts are generous and files run
// sequentially.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.js"],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
