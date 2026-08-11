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
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * Workflow DevKit evaluates the workflow graph in a CJS sandbox without Node
 * builtins. Static imports of `@/lib/log` (historically typed from `chat`),
 * `@/lib/env`, `@vercel/sandbox`, or `chat` itself crash the sandbox before
 * steps run. Keep these modules behind dynamic `import()` inside `"use step"`.
 */
const FORBIDDEN_SPECIFIERS = ["chat", "@/lib/log", "@/lib/env", "@vercel/sandbox"] as const;

const WORKFLOWS_ROOT = import.meta.dirname;

function listWorkflowSandboxModules(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith(".test.ts")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listWorkflowSandboxModules(fullPath));
      continue;
    }
    if (!entry.name.endsWith(".ts")) {
      continue;
    }
    const source = readFileSync(fullPath, "utf8");
    // sandbox-utils is loaded inside step sandboxes even without a directive.
    if (
      source.includes('"use workflow"') ||
      source.includes('"use step"') ||
      entry.name === "sandbox-utils.ts"
    ) {
      results.push(path.relative(WORKFLOWS_ROOT, fullPath));
    }
  }
  return results.sort();
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Collect static import/export-from specifiers. Dynamic `import("...")` calls
 * are intentionally excluded — those are the required sandbox-safe pattern.
 */
function staticImportSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specifiers: string[] = [];
  // Statement-position `import ...` only (not `await import(...)`).
  const importRe =
    /(?:^|[;\n])\s*import\s(?!\()(?:type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"'`]+)["']/g;
  // Re-exports can also pull forbidden modules into the sandbox graph.
  const exportFromRe = /(?:^|[;\n])\s*export\s(?:type\s+)?[^"'`;]*?\sfrom\s+["']([^"'`]+)["']/g;

  for (const re of [importRe, exportFromRe]) {
    for (const match of code.matchAll(re)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function isForbiddenSpecifier(specifier: string): boolean {
  return FORBIDDEN_SPECIFIERS.some(
    (forbidden) =>
      specifier === forbidden || (forbidden === "chat" && specifier.startsWith("chat/")),
  );
}

const WORKFLOW_MODULES = listWorkflowSandboxModules(WORKFLOWS_ROOT);

describe("workflow step sandbox import boundaries", () => {
  it("discovers workflow and step modules to guard", () => {
    expect(WORKFLOW_MODULES.length).toBeGreaterThan(10);
    expect(WORKFLOW_MODULES).toEqual(expect.arrayContaining(["steps/sandbox-utils.ts"]));
  });

  it.each(WORKFLOW_MODULES)("%s avoids forbidden static imports", (relativePath) => {
    const source = readFileSync(path.join(WORKFLOWS_ROOT, relativePath), "utf8");
    const offenders = staticImportSpecifiers(source).filter(isForbiddenSpecifier);
    expect(offenders, `${relativePath} has forbidden static imports`).toEqual([]);
  });
});
