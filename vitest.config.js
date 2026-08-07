import { defineConfig } from "vitest/config";

// Unit tests only. Integration tests live under test/integration/ and run via
// `npm run test:integration` (their own config), since they need a real CouchDB.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test/integration/**"],
  },
});
