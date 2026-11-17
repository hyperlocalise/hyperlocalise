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
import { globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { PLAYWRIGHT_CORE_TRACE_GLOBS, PLAYWRIGHT_CORE_TRACE_ROUTE } from "./playwright-trace";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("playwright-core file trace", () => {
  it("targets the workflow flow route that executes steps", () => {
    expect(PLAYWRIGHT_CORE_TRACE_ROUTE).toBe("/.well-known/workflow/v1/flow");

    const nextConfig = readFileSync(join(appRoot, "next.config.ts"), "utf8");
    expect(nextConfig).toContain("PLAYWRIGHT_CORE_TRACE_ROUTE");
    expect(nextConfig).toContain("PLAYWRIGHT_CORE_TRACE_GLOBS");
    expect(nextConfig).toContain('"playwright-core"');
    expect(nextConfig).not.toContain("/.well-known/workflow/v1/step");
  });

  it("includes browsers.json from the pnpm package path", () => {
    const files = PLAYWRIGHT_CORE_TRACE_GLOBS.flatMap((pattern) =>
      globSync(pattern, { cwd: appRoot }),
    );
    expect(files.some((file) => file.endsWith("playwright-core/browsers.json"))).toBe(true);
  });
});
