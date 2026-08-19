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
import { describe, expect, it } from "vite-plus/test";
import { Bash, InMemoryFs } from "just-bash";

import { createBashTool, isAllowedBashCommand } from "./bash";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [], context: {} };

function createTestContext(): RepoToolContext {
  const fs = new InMemoryFs({ "/home/user/project/readme.md": "hello" });
  return { bash: new Bash({ fs, cwd: "/home/user/project" }) };
}

describe("isAllowedBashCommand", () => {
  it("allows git status", () => {
    expect(isAllowedBashCommand("git status --short")).toBe(true);
  });

  it("blocks chained commands", () => {
    expect(isAllowedBashCommand("git status && rm -rf /")).toBe(false);
  });

  it("blocks curl", () => {
    expect(isAllowedBashCommand("curl https://example.com")).toBe(false);
  });

  it("blocks find -exec", () => {
    expect(isAllowedBashCommand("find . -type f -exec bash -c 'env' {} +")).toBe(false);
  });

  it("blocks find -delete", () => {
    expect(isAllowedBashCommand("find . -type f -delete")).toBe(false);
  });

  it("blocks find -fprint", () => {
    expect(isAllowedBashCommand("find . -type f -fprint output.txt")).toBe(false);
  });

  it("allows benign find without destructive flags", () => {
    expect(isAllowedBashCommand("find . -type f")).toBe(true);
  });

  it("blocks find -fprintf file writes", () => {
    expect(isAllowedBashCommand("find . -type f -fprintf pwned.txt attacker")).toBe(false);
  });

  it("blocks quoted find -fprintf", () => {
    expect(isAllowedBashCommand(`find . -type f "-fprintf" pwned.txt attacker`)).toBe(false);
  });

  it("blocks find -fprint0 and -printf", () => {
    expect(isAllowedBashCommand("find . -type f -fprint0 pwned.txt")).toBe(false);
    expect(isAllowedBashCommand("find . -type f -printf %p")).toBe(false);
  });

  it("allows hl check without write flags", () => {
    expect(isAllowedBashCommand("hl check --format json --quiet")).toBe(true);
  });

  it("allows hl check --fix-dry-run", () => {
    expect(isAllowedBashCommand("hl check --fix-dry-run")).toBe(true);
  });

  it.each([
    "hl check --fix",
    "hl check --fix=true",
    "hl check --output-file report.json",
    "hl check --json-report=report.json",
    "hl extract --out-file stolen.json",
    `hl check "--output-file" pwned.txt`,
  ])("blocks hl write flag in %s", (command) => {
    expect(isAllowedBashCommand(command)).toBe(false);
  });

  it("allows hl status --output as a format, not a write path", () => {
    expect(isAllowedBashCommand("hl status --output csv")).toBe(true);
  });

  it("allows find -o as OR", () => {
    expect(isAllowedBashCommand("find . -name '*.json' -o -name '*.yaml' -type f")).toBe(true);
  });

  it("allows git log --oneline", () => {
    expect(isAllowedBashCommand("git log --oneline")).toBe(true);
  });

  it.each([
    "git log --output=package.json",
    "git log --output package.json",
    "git show HEAD --output=src/index.ts",
    "git diff --output=evil.js",
    "git log -o package.json",
    "git log -O orderfile",
    "git log -opackage.json",
    `git log "--output=package.json"`,
    `git log "--output" pwned.txt`,
  ])("blocks git output write flag in %s", (command) => {
    expect(isAllowedBashCommand(command)).toBe(false);
  });

  it.each([
    "git log --output=/tmp/x",
    "git log --output=../../outside.txt",
    "git diff --output=/tmp/evil.js",
    `git show HEAD --output="/tmp/x"`,
    "git log --output=../outside.txt",
    "find . -path=/tmp/x -type f",
    "find . -path=../../etc -type f",
  ])("blocks attached absolute or parent path in %s", (command) => {
    expect(isAllowedBashCommand(command)).toBe(false);
  });
});

describe("createBashTool", () => {
  it("runs allowlisted git status", async () => {
    const tool = createBashTool(createTestContext());
    const result = await tool.execute!({ command: "git status --short" }, toolCallInfo);
    expect(result).toMatchObject({ success: expect.any(Boolean) });
  });

  it("rejects disallowed commands", async () => {
    const tool = createBashTool(createTestContext());
    const result = await tool.execute!({ command: "curl https://example.com" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
  });

  it("rejects find -fprintf before execution", async () => {
    const tool = createBashTool(createTestContext());
    const result = await tool.execute!(
      { command: "find . -type f -fprintf pwned.txt attacker" },
      toolCallInfo,
    );
    expect(result).toMatchObject({ success: false });
  });

  it("rejects hl check --fix before execution", async () => {
    const tool = createBashTool(createTestContext());
    const result = await tool.execute!({ command: "hl check --fix" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
  });

  it("rejects git log --output before execution", async () => {
    const exec = async () => {
      throw new Error("bash.exec must not run for git --output");
    };
    const tool = createBashTool({
      bash: {
        exec,
        readFile: async () => "",
      },
    });
    const result = await tool.execute!({ command: "git log --output=package.json" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
  });

  it("rejects git show -o before execution", async () => {
    const tool = createBashTool({
      bash: {
        exec: async () => {
          throw new Error("bash.exec must not run for git -o");
        },
        readFile: async () => "",
      },
    });
    const result = await tool.execute!({ command: "git show HEAD -o src/index.ts" }, toolCallInfo);
    expect(result).toMatchObject({ success: false });
  });

  it("treats git diff exit 1 as success and returns the patch", async () => {
    const patch =
      'diff --git a/src/locales/en/messages.json b/src/locales/en/messages.json\n+  "save": "Save"\n';
    const tool = createBashTool({
      bash: {
        exec: async (bin, options) => {
          expect(bin).toBe("git");
          expect(options?.args).toEqual(["diff", "HEAD^", "HEAD"]);
          return { stdout: patch, stderr: "", exitCode: 1, env: {} };
        },
        readFile: async () => "",
      },
    });

    const result = await tool.execute!({ command: "git diff HEAD^ HEAD" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      exitCode: 1,
      stdout: patch,
    });
  });

  it("treats git diff exit 1 as success after injecting -C", async () => {
    const patch = "diff --git a/messages.json b/messages.json\n";
    const tool = createBashTool({
      bash: {
        exec: async (bin, options) => {
          expect(bin).toBe("git");
          expect(options?.args).toEqual(["-C", "scribe-fe-v2", "diff", "HEAD^", "HEAD"]);
          return { stdout: patch, stderr: "", exitCode: 1, env: {} };
        },
        readFile: async () => "",
      },
    });

    const result = await tool.execute!(
      { command: "git diff HEAD^ HEAD", cwd: "scribe-fe-v2" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true, exitCode: 1, stdout: patch });
  });

  it("fails git diff on exit codes of 2 or higher", async () => {
    const tool = createBashTool({
      bash: {
        exec: async () => ({
          stdout: "usage: git diff [<options>]",
          stderr: "",
          exitCode: 129,
          env: {},
        }),
        readFile: async () => "",
      },
    });

    const result = await tool.execute!({ command: "git diff HEAD^ HEAD" }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      exitCode: 129,
      stdout: "usage: git diff [<options>]",
    });
  });
});
