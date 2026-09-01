import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

const storybookDir = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
    "@storybook/addon-vitest",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  async viteFinal(viteConfig) {
    const authkitComponentsMock = path.resolve(
      storybookDir,
      "./mocks/authkit-nextjs-components.tsx",
    );
    const aiFeaturesAccessMock = path.resolve(storybookDir, "./mocks/use-ai-features-access.ts");

    viteConfig.resolve ??= {};
    const existingAlias = viteConfig.resolve.alias;

    if (Array.isArray(existingAlias)) {
      viteConfig.resolve.alias = [
        ...existingAlias,
        {
          find: "@workos-inc/authkit-nextjs/components",
          replacement: authkitComponentsMock,
        },
        {
          find: "@/lib/billing/use-ai-features-access",
          replacement: aiFeaturesAccessMock,
        },
      ];
    } else {
      viteConfig.resolve.alias = Object.assign(
        {},
        existingAlias && !Array.isArray(existingAlias) ? existingAlias : {},
        {
          "@workos-inc/authkit-nextjs/components": authkitComponentsMock,
          "@/lib/billing/use-ai-features-access": aiFeaturesAccessMock,
        },
      );
    }

    return viteConfig;
  },
};
export default config;
