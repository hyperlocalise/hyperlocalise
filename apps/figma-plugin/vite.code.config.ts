import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  build: {
    lib: {
      entry: path.join(rootDir, "src/code.ts"),
      formats: ["iife"],
      name: "figmaPlugin",
      fileName: () => "code.js",
    },
    target: "es2020",
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: false,
    sourcemap: process.env.NODE_ENV === "production" ? false : "inline",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
