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

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// Long assistant stories stream several replies before their checks finish.
const STORY_TEST_TIMEOUT_MS = 60_000;

export default defineConfig({
  resolve: {
    // A top-level "@" alias would be merged ahead of the mock aliases in .storybook/main.ts.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(rootDir, ".storybook") })],
        test: {
          name: "storybook",
          testTimeout: STORY_TEST_TIMEOUT_MS,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
