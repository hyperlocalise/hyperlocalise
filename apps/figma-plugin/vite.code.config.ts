import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
