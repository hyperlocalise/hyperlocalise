import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { viteSingleFile } from "vite-plugin-singlefile";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, "src");

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
  },
  lint: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml", "vite.code.config.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    root: rootDir,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  root: srcDir,
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      src: srcDir,
    },
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    cssCodeSplit: false,
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(srcDir, "ui.html"),
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
