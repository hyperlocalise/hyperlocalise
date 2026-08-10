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
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vite-plus/test";

const require = createRequire(import.meta.url);

function resolvePnpmPackageDir(packagePrefix: string, packageName: string): string {
  const pnpmDir = path.join(process.cwd(), "node_modules/.pnpm");
  const entry = readdirSync(pnpmDir).find((name) => name.startsWith(packagePrefix));
  if (!entry) {
    throw new Error(`Unable to locate ${packagePrefix} in node_modules/.pnpm`);
  }
  return path.join(pnpmDir, entry, "node_modules", packageName);
}

type EsbuildBuild = {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles?: Array<{ text: string }>;
  }>;
};

function loadEsbuild(): EsbuildBuild {
  const buildersDir = resolvePnpmPackageDir("@workflow+builders@", "@workflow/builders");
  return require(require.resolve("esbuild", { paths: [buildersDir] })) as EsbuildBuild;
}

function resolveChatContextChunkPath(): string {
  const chatDir = resolvePnpmPackageDir("chat@4.36.0", "chat");
  return path.join(chatDir, "dist/chunk-3VEMJAGK.js");
}

/**
 * Chat SDK Message/Thread classes use @workflow/serde, so Workflow DevKit
 * discovers `chat` and side-effect-imports it into the shared workflow VM
 * bundle. A static `async_hooks` import becomes `require("async_hooks")` in
 * that CJS sandbox and crashes every workflow (including source-file-ingest).
 */
describe("chat package workflow sandbox compatibility", () => {
  it("does not statically import async_hooks from the conversation context chunk", () => {
    const source = readFileSync(resolveChatContextChunkPath(), "utf8");

    expect(source).not.toMatch(/from\s+["']async_hooks["']/);
    expect(source).not.toMatch(/from\s+["']node:async_hooks["']/);
    expect(source).toContain('getBuiltinModule("async_hooks")');
  });

  it("bundles into a workflow-like CJS sandbox without require(async_hooks)", async () => {
    const esbuild = loadEsbuild();

    const result = await esbuild.build({
      stdin: {
        contents: "import 'chat';",
        resolveDir: process.cwd(),
        sourcefile: "virtual-entry.js",
        loader: "js",
      },
      bundle: true,
      write: false,
      format: "cjs",
      platform: "neutral",
      mainFields: ["module", "main"],
      conditions: ["workflow"],
      target: "es2022",
      logLevel: "silent",
    });

    const text = result.outputFiles[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/require\(["']async_hooks["']\)/);
    expect(text).not.toMatch(/require\(["']node:async_hooks["']\)/);
    expect(text).toContain('getBuiltinModule("async_hooks")');

    const sandbox: Record<string, unknown> = {
      module: { exports: {} },
      exports: {},
      process: { versions: {} },
    };
    sandbox.globalThis = sandbox;

    expect(() => {
      vm.runInNewContext(text, sandbox, {
        filename: "workflow-chat-bundle.cjs",
        timeout: 5000,
      });
    }).not.toThrow();
  });
});
