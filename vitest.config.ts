import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    setupFiles: ["apps/web/src/test/setup-i18n.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
