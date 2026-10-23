import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.js"],
    fileParallelism: false, // all files share the lumen_test database
    testTimeout: 15000,
  },
});
