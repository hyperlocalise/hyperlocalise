import { describe, expect, it, vi } from "vite-plus/test";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { createApplyPatchTool } from "./apply-patch";
import { createWriteTool } from "./write";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

function createWriteContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "admin",
    projectId: null,
    db: {} as never,
    workMode: "write",
    repositorySource: "github",
    actor: { sourceUserId: "user_1", role: "admin" },
    sandboxId: "sbx_1",
    ...overrides,
  };
}

function createRepoContext(overrides: Partial<RepoToolContext["bash"]> = {}) {
  const exec = vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "", env: {} }));
  const readFile = vi.fn(async () => "");
  const writeWorkspaceFile = vi.fn(async () => undefined);
  const repo: RepoToolContext = {
    bash: {
      exec,
      readFile,
      writeWorkspaceFile,
      ...overrides,
    },
  };
  return { exec, readFile, repo, writeWorkspaceFile };
}

describe("createWriteTool", () => {
  it("writes complete file contents to a normalized workspace path", async () => {
    const { repo, writeWorkspaceFile } = createRepoContext();
    const write = createWriteTool(createWriteContext(), repo);

    const result = await write.execute!(
      { filePath: "./src/mock.tsx", content: "export const value = 1;\n" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      path: "src/mock.tsx",
      byteSize: 24,
    });
    expect(writeWorkspaceFile).toHaveBeenCalledWith("src/mock.tsx", "export const value = 1;\n");
  });

  it("denies writes when repository write context is unavailable", async () => {
    const { repo, writeWorkspaceFile } = createRepoContext();
    const write = createWriteTool(
      createWriteContext({ workMode: undefined, repositorySource: undefined, actor: undefined }),
      repo,
    );

    const result = await write.execute!(
      { filePath: "src/mock.tsx", content: "export const value = 1;\n" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Write context is not available for this tool.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("createApplyPatchTool", () => {
  it("checks and applies a unified diff patch", async () => {
    const { exec, repo, writeWorkspaceFile } = createRepoContext();
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);
    const patch = [
      "diff --git a/src/mock.tsx b/src/mock.tsx",
      "index 1111111..2222222 100644",
      "--- a/src/mock.tsx",
      "+++ b/src/mock.tsx",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    const result = await applyPatch.execute!({ patch }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      changedPaths: ["src/mock.tsx"],
    });
    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/),
      patch,
    );
    expect(exec).toHaveBeenNthCalledWith(1, "git", {
      args: [
        "apply",
        "--check",
        expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/),
      ],
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", {
      args: ["apply", expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/)],
    });
    expect(exec).toHaveBeenNthCalledWith(3, "rm", {
      args: ["-f", expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/)],
    });
  });

  it("rejects patches that escape the workspace", async () => {
    const { repo, writeWorkspaceFile } = createRepoContext();
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);

    const result = await applyPatch.execute!(
      {
        patch: [
          "diff --git a/../secret b/../secret",
          "--- a/../secret",
          "+++ b/../secret",
          "@@ -1 +1 @@",
          "-old",
          "+new",
          "",
        ].join("\n"),
      },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Patch contains a path outside the workspace.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});
