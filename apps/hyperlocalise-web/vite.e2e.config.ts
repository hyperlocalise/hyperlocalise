/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
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

// Prefer .env.e2e so unit-test placeholder WorkOS keys in .env are not used.
loadDotenv({ path: path.join(rootDir, ".env") });
loadDotenv({ path: path.join(rootDir, ".env.e2e"), override: true });

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    environment: "node",
    include: ["src/e2e/**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    server: {
      deps: {
        inline: ["@workos-inc/authkit-nextjs", "@workos-inc/node"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "next/cache": path.resolve(rootDir, "node_modules/next/cache.js"),
      "next/headers": path.resolve(rootDir, "node_modules/next/headers.js"),
      "next/navigation": path.resolve(rootDir, "node_modules/next/navigation.js"),
      "server-only": path.resolve(rootDir, "src/test/mocks/server-only.ts"),
    },
  },
});
