import { describe, expect, it } from "vite-plus/test";
import { Bash, defineCommand, InMemoryFs } from "just-bash";

import { createGlobTool } from "./glob";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

describe("createGlobTool", () => {
  it("lists files via ripgrep", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const tool = createGlobTool({
      bash: {
        exec: async (command, options) => {
          calls.push({ command, args: options?.args ?? [] });
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
        args: expect.arrayContaining(["--files", "--glob", "locales/*.json"]),
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
});
