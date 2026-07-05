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

export default defineConfig({
  fmt: {
    ignorePatterns: ["drizzle/**", "pnpm-*.yaml"],
  },
  lint: {
    ignorePatterns: ["drizzle/**", "pnpm-*.yaml"],
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
    setupFiles: ["./src/test/setup-dom.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/e2e/**"],
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
    },
  },
});
