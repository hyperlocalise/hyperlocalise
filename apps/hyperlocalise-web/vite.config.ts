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
import pluginFormatjs from "eslint-plugin-formatjs";
import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: path.join(rootDir, ".env") });

const formatjsRulesOff = Object.fromEntries(
  Object.entries({
    ...pluginFormatjs.configs.strict.rules,
  }).map(([rule]) => [rule, "off"]),
);

// Keep Hyperlocalise-synced target catalogs as pulled (see i18n.yml targets).
const translatedLocales = ["de-DE", "fr-FR", "vi-VN", "zh-CN"] as const;
const translatedIgnorePatterns = translatedLocales.flatMap((locale) => [
  `_posts/${locale}/**`,
  `lang/${locale}.json`,
]);

const isCi = process.env.CI === "true";

export default defineConfig({
  cacheDir: ".cache/vite",
  fmt: {
    ignorePatterns: ["drizzle/**", "pnpm-*.yaml", ...translatedIgnorePatterns],
  },
  lint: {
    // Match tsconfig exclude: browser e2e is local-only (vite.e2e.config.ts).
    ignorePatterns: ["drizzle/**", "pnpm-*.yaml", "src/e2e/**", ...translatedIgnorePatterns],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: ["eslint-plugin-formatjs"],
    rules: {
      ...pluginFormatjs.configs.strict.rules,
      // Most UI is not localized yet; re-enable as /localise coverage grows.
      "formatjs/no-literal-string-in-jsx": "off",
    },
    overrides: [
      {
        files: ["**/*.stories.ts", "**/*.stories.tsx", "**/*.test.ts", "**/*.test.tsx"],
        rules: formatjsRulesOff as Partial<
          Record<keyof typeof pluginFormatjs.configs.strict.rules, "off">
        >,
      },
    ],
  },
  test: {
    environment: "node",
    silent: "passed-only",
    pool: "threads",
    reporters: isCi ? ["dot", "github-actions"] : ["default"],
    setupFiles: ["./src/test/setup-dom.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/e2e/**"],
    experimental: {
      fsModuleCache: true,
      fsModuleCachePath: ".cache/vitest",
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "drizzle-orm",
            "drizzle-orm/node-postgres",
            "hono",
            "pg",
            "react",
            "react-dom",
            "react-intl",
            "zod",
          ],
        },
        client: {
          enabled: true,
          include: [
            "@testing-library/dom",
            "@testing-library/jest-dom",
            "@testing-library/react",
            "react",
            "react-dom",
            "react-intl",
          ],
        },
      },
    },
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          navigation: {
            disableChildFrameNavigation: true,
            disableChildPageNavigation: true,
          },
        },
      },
    },
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
      // AuthKit 4.3+ imports `server-only` at module scope; stub it for Vitest.
      "server-only": path.resolve(rootDir, "src/test/mocks/server-only.ts"),
    },
  },
});
