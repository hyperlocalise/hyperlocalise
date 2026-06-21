import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
  },
  lint: {
    ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      src: path.resolve(rootDir, "src"),
    },
  },
});
