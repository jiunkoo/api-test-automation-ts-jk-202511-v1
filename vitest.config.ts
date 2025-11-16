import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    reporters: "default",
    setupFiles: ["./src/tests/test.bootstrap.ts"],
    retry: 0,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov", "html"],
      exclude: ["src/tests/test.bootstrap.ts", "src/utils/mock-helpers.ts"],
    },
  },
});
