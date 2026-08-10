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
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * Workflow DevKit evaluates the workflow graph in a CJS sandbox without Node
 * builtins. Static imports of `@/lib/log` (historically typed from `chat`),
 * `@/lib/env`, `@vercel/sandbox`, or `chat` itself crash the sandbox before
 * steps run. Keep these modules behind dynamic `import()` inside `"use step"`.
 */
const WORKFLOW_MODULES = [
  "email-translation.ts",
  "steps/provider-agent-translation.ts",
  "steps/sandbox-utils.ts",
  "steps/workspace-automation-execution.ts",
] as const;

const FORBIDDEN_STATIC_IMPORTS = [
  /from\s+["']chat["']/,
  /from\s+["']@\/lib\/log["']/,
  /from\s+["']@\/lib\/env["']/,
  /from\s+["']@vercel\/sandbox["']/,
] as const;

describe("workflow step sandbox import boundaries", () => {
  it.each(WORKFLOW_MODULES)("%s avoids forbidden static imports", (relativePath) => {
    const source = readFileSync(path.join(import.meta.dirname, relativePath), "utf8");
    for (const pattern of FORBIDDEN_STATIC_IMPORTS) {
      expect(source, `${relativePath} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});
