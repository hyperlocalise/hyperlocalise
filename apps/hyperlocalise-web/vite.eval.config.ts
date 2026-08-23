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

// Evals call real models through the AI Gateway. Copy .env.eval.example to
// .env.eval and set AI_GATEWAY_API_KEY; keep placeholder keys in .env so
// `vp test` stays hermetic (eval files are excluded from the unit-test glob).
loadDotenv({ path: path.join(rootDir, ".env") });
loadDotenv({ path: path.join(rootDir, ".env.eval"), override: true });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.eval.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    server: {
      deps: {
        inline: ["@workos-inc/authkit-nextjs"],
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
