import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    reporters: "default",
    setupFiles: ["./src/tests/test.bootstrap.ts"],
  },
});
