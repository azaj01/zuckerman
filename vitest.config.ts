import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@server/world": resolve(__dirname, "./src/server/world"),
      "@server/agents": resolve(__dirname, "./src/server/agents"),
      "@clients/cli": resolve(__dirname, "./src/clients/cli"),
      "@clients/app": resolve(__dirname, "./src/clients/app"),
      "@shared": resolve(__dirname, "./src/shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "dist/",
        "**/*.config.*",
      ],
    },
  },
});
