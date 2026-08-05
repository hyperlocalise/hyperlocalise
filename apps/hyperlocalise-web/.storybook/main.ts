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

    viteConfig.resolve ??= {};
    const existingAlias = viteConfig.resolve.alias;

    if (Array.isArray(existingAlias)) {
      viteConfig.resolve.alias = [
        ...existingAlias,
        {
          find: "@workos-inc/authkit-nextjs/components",
          replacement: authkitComponentsMock,
        },
      ];
    } else {
      viteConfig.resolve.alias = {
        ...existingAlias,
        "@workos-inc/authkit-nextjs/components": authkitComponentsMock,
      };
    }

    return viteConfig;
  },
};
export default config;
