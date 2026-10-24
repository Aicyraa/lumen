import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false, // all files share the lumen_test database
    testTimeout: 15000,
    hookTimeout: 30000, // closing a pool that has stuck connections can take a while
  },
});
