import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    // The integration files share one database, which each of them resets.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(
        import.meta.dirname,
        "node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
});
