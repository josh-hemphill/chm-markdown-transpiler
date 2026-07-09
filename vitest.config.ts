import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "fixtures/**/*.test.ts"],
    testTimeout: 60_000,
    globalSetup: ["fixtures/global-setup.ts"],
  },
});
