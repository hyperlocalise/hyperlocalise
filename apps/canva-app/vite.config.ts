import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: path.join(rootDir, ".env") });

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
  },
  lint: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml", "scripts/**"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      styles: path.resolve(rootDir, "styles"),
    },
  },
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
});
