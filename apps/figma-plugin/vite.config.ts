import path from "node:path";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite-plus";
import { viteSingleFile } from "vite-plugin-singlefile";

import { resolveHyperlocaliseAppUrlForBuild } from "./vite/load-env";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, "src");

/** Resolves `@create-figma-plugin/ui` side-effect CSS imports (`!../css/base.css`). */
function createFigmaPluginSideEffectCss(): Plugin {
  return {
    name: "create-figma-plugin-side-effect-css",
    resolveId(source, importer) {
      if (!source.startsWith("!") || !source.endsWith(".css") || !importer) {
        return null;
      }
      if (!importer.includes(`${path.sep}@create-figma-plugin${path.sep}`)) {
        return null;
      }
      const relativePath = source.slice(1);
      return path.normalize(path.join(path.dirname(importer), relativePath));
    },
  };
}

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
  },
  lint: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml", "vite.code.config.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    root: rootDir,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    css: true,
    server: {
      deps: {
        inline: ["@create-figma-plugin/ui"],
      },
    },
  },
  root: srcDir,
  define: {
    HYPERLOCALISE_APP_URL: JSON.stringify(resolveHyperlocaliseAppUrlForBuild()),
  },
  plugins: [createFigmaPluginSideEffectCss(), preact(), viteSingleFile()],
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
