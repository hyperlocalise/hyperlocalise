/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
