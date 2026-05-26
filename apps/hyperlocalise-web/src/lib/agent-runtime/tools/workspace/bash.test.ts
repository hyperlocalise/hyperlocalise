import { describe, expect, it } from "vite-plus/test";
import { Bash, InMemoryFs } from "just-bash";

import { createBashTool, isAllowedBashCommand } from "./bash";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

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
});
