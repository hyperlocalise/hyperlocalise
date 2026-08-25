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
import { Bash, defineCommand, InMemoryFs } from "just-bash";

import { createGlobTool } from "./glob";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [], context: {} };

function unwrapSearchCommand(command: string, args: string[]) {
  if (command !== "bash" || args[0] !== "-c") {
    return { command, args };
  }

  return {
    command: args[4] ?? "",
    args: args.slice(5),
  };
}

describe("createGlobTool", () => {
  it("lists files via ripgrep", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const tool = createGlobTool({
      bash: {
        exec: async (command, options) => {
          calls.push(unwrapSearchCommand(command, options?.args ?? []));
          return {
            stdout: "locales/en.json\nlocales/fr.json\n",
            stderr: "",
            exitCode: 0,
            env: {},
          };
        },
        readFile: async () => "",
      },
    });

    const result = await tool.execute!({ pattern: "locales/*.json" }, toolCallInfo);

    expect(calls).toEqual([
      {
        command: "rg",
        args: expect.arrayContaining(["--files", "--no-follow", "--glob", "locales/*.json"]),
      },
    ]);
    expect(result).toMatchObject({ success: true, count: 2 });
    expect((result as { files: Array<{ path: string }> }).files[0].path).toContain("en.json");
  });

  it("falls back to find when ripgrep is unavailable", async () => {
    const fs = new InMemoryFs({
      "/home/user/project/locales/en.json": "{}",
      "/home/user/project/locales/fr.json": "{}",
    });
    const bash = new Bash({ fs, cwd: "/home/user/project" });
    bash.registerCommand(
      defineCommand("rg", async () => ({
        stdout: "",
        stderr: "rg: command not found",
        exitCode: 127,
      })),
    );
    bash.registerCommand(
      defineCommand("find", async (args: string[]) => {
        if (args.includes("locales") && args.includes("*.json")) {
          return { stdout: "locales/en.json\nlocales/fr.json\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    );

    const ctx: RepoToolContext = { bash };
    const tool = createGlobTool(ctx);
    const result = await tool.execute!({ pattern: "locales/*.json" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, count: 2 });
    expect((result as { files: Array<{ path: string }> }).files[0].path).toContain("en.json");
  });

  it("rejects search paths outside the workspace", async () => {
    const tool = createGlobTool({
      bash: new Bash({ fs: new InMemoryFs(), cwd: "/home/user/project" }),
    });
    const result = await tool.execute!({ pattern: "**/*.json", path: "../outside" }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: "Search path must stay within the workspace.",
      files: [],
    });
  });

  it("rejects an outside-workspace symlink search root before ripgrep runs", async () => {
    const fs = new InMemoryFs({
      "/home/user/project/README.md": "safe",
      "/tmp/external/secret.json": "{}",
    });
    await fs.symlink("/tmp/external", "/home/user/project/leak");
    const invokedCommands: string[] = [];
    const bash = new Bash({ fs, cwd: "/home/user/project" });
    bash.registerCommand(
      defineCommand("rg", async () => {
        invokedCommands.push("rg");
        return { stdout: "leak/secret.json\n", stderr: "", exitCode: 0 };
      }),
    );

    const result = await createGlobTool({ bash }).execute!(
      { pattern: "**/*.json", path: "leak" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Search path must not contain symbolic links.",
      files: [],
    });
    expect(JSON.stringify(result)).not.toContain("secret.json");
    expect(invokedCommands).toEqual([]);
  });

  it("rejects a symlinked search-root parent even when its target stays in the workspace", async () => {
    const fs = new InMemoryFs({
      "/home/user/project/actual/nested/secret.json": "{}",
      "/home/user/project/routes/.keep": "",
    });
    await fs.symlink("../actual", "/home/user/project/routes/link");
    const invokedCommands: string[] = [];
    const bash = new Bash({ fs, cwd: "/home/user/project" });
    bash.registerCommand(
      defineCommand("rg", async () => {
        invokedCommands.push("rg");
        return { stdout: "routes/link/nested/secret.json\n", stderr: "", exitCode: 0 };
      }),
    );

    const result = await createGlobTool({ bash }).execute!(
      { pattern: "**/*.json", path: "routes/link/nested" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Search path must not contain symbolic links.",
      files: [],
    });
    expect(JSON.stringify(result)).not.toContain("secret.json");
    expect(invokedCommands).toEqual([]);
  });
});
