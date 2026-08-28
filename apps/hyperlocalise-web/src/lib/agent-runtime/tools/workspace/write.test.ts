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
import { describe, expect, it, vi } from "vite-plus/test";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { createApplyPatchTool, disallowedGitFileModeError } from "./apply-patch";
import { createWriteTool } from "./write";
import type { RepoToolContext } from "./types";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [], context: {} };

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
  const exec = vi.fn(async (command: string, options?: { args?: string[] }) => {
    const args = options?.args ?? [];
    if (command === "test" && args[0] === "-L") {
      return { exitCode: 1, stdout: "", stderr: "", env: {} };
    }
    return { exitCode: 0, stdout: "", stderr: "", env: {} };
  });
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

  it.each([".git/config", "./.git/hooks/pre-commit", "vendor/lib/.git/config", ".git"])(
    "denies writes to git metadata path %s",
    async (filePath) => {
      const { repo, writeWorkspaceFile } = createRepoContext();
      const write = createWriteTool(createWriteContext(), repo);

      const result = await write.execute!(
        {
          filePath,
          content: "[core]\nfsmonitor = sh ./payload\n",
        },
        toolCallInfo,
      );

      expect(result).toMatchObject({
        success: false,
        error: "Writes under .git/ are not allowed.",
      });
      expect(writeWorkspaceFile).not.toHaveBeenCalled();
    },
  );

  it("allows writes to .gitignore", async () => {
    const { repo, writeWorkspaceFile } = createRepoContext();
    const write = createWriteTool(createWriteContext(), repo);

    const result = await write.execute!(
      { filePath: ".gitignore", content: "node_modules\n" },
      toolCallInfo,
    );

    expect(result).toMatchObject({ success: true, path: ".gitignore" });
    expect(writeWorkspaceFile).toHaveBeenCalledWith(".gitignore", "node_modules\n");
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
    expect(exec).toHaveBeenCalledWith("git", {
      args: ["ls-files", "--stage", "--", "src/mock.tsx"],
    });
    expect(exec).toHaveBeenCalledWith("git", {
      args: ["ls-tree", "HEAD", "--", "src/mock.tsx"],
    });
    expect(exec).toHaveBeenCalledWith("test", { args: ["-L", "src"] });
    expect(exec).toHaveBeenCalledWith("test", { args: ["-L", "src/mock.tsx"] });
    expect(exec).toHaveBeenCalledWith("git", {
      args: [
        "apply",
        "--check",
        expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/),
      ],
    });
    expect(exec).toHaveBeenCalledWith("git", {
      args: ["apply", expect.stringMatching(/^\.hyperlocalise-agent\/patches\/.+\.diff$/)],
    });
    expect(exec).toHaveBeenCalledWith("rm", {
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

  it("rejects patches that target .git/config", async () => {
    const { repo, writeWorkspaceFile } = createRepoContext();
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);

    const result = await applyPatch.execute!(
      {
        patch: [
          "diff --git a/.git/config b/.git/config",
          "--- a/.git/config",
          "+++ b/.git/config",
          "@@ -1 +1,2 @@",
          " [core]",
          "+	fsmonitor = sh ./payload",
          "",
        ].join("\n"),
      },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "Patch must not modify files under .git/.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("rejects git symlink and submodule file modes before writing the patch", async () => {
    const { exec, repo, writeWorkspaceFile } = createRepoContext();
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);
    const symlinkPatch = [
      "diff --git a/playwright b/playwright",
      "new file mode 120000",
      "index 0000000..2aae6c3",
      "--- /dev/null",
      "+++ b/playwright",
      "@@ -0,0 +1 @@",
      "+/tmp/hyperlocalise-browser-runtime/node_modules/playwright",
      "",
    ].join("\n");

    const result = await applyPatch.execute!({ patch: symlinkPatch }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: "Patch must not create or modify symbolic links or git submodules.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("rejects index-line symlink modes and submodule gitlinks", () => {
    expect(
      disallowedGitFileModeError(
        [
          "diff --git a/link b/link",
          "index 1111111..2222222 120000",
          "--- a/link",
          "+++ b/link",
          "@@ -1 +1 @@",
          "-/old",
          "+/tmp/hyperlocalise-browser-runtime",
          "",
        ].join("\n"),
      ),
    ).toBe("Patch must not create or modify symbolic links or git submodules.");

    expect(
      disallowedGitFileModeError(
        [
          "diff --git a/vendor/lib b/vendor/lib",
          "new file mode 160000",
          "index 0000000..abcdef1",
          "--- /dev/null",
          "+++ b/vendor/lib",
          "@@ -0,0 +1 @@",
          "+Subproject commit abcdef1",
          "",
        ].join("\n"),
      ),
    ).toBe("Patch must not create or modify symbolic links or git submodules.");

    expect(
      disallowedGitFileModeError(
        ["old mode 100644", "new mode 120000", "--- a/src/app.tsx", "+++ b/src/app.tsx"].join("\n"),
      ),
    ).toBe("Patch must not create or modify symbolic links or git submodules.");
  });

  it("does not treat file content that mentions git modes as a symlink patch", () => {
    const patch = [
      "diff --git a/README.md b/README.md",
      "index 1111111..2222222 100644",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1,2 @@",
      " docs",
      "+new file mode 120000",
      "",
    ].join("\n");

    expect(disallowedGitFileModeError(patch)).toBeUndefined();
  });

  it("rejects a headerless hunk that retargets an existing index symlink", async () => {
    const { exec, repo, writeWorkspaceFile } = createRepoContext();
    exec.mockImplementation(async (command: string, options?: { args?: string[] }) => {
      const args = options?.args ?? [];
      if (command === "git" && args[0] === "ls-files") {
        return {
          exitCode: 0,
          stdout: "120000 2aae6c35c94fcfb415dbe95f408b9ce442564d5a 0\tplaywright\n",
          stderr: "",
          env: {},
        };
      }
      if (command === "test" && args[0] === "-L") {
        return { exitCode: 1, stdout: "", stderr: "", env: {} };
      }
      return { exitCode: 0, stdout: "", stderr: "", env: {} };
    });
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);
    const patch = [
      "diff --git a/playwright b/playwright",
      "--- a/playwright",
      "+++ b/playwright",
      "@@ -1 +1 @@",
      "-old",
      "+/tmp/hyperlocalise-browser-runtime",
      "",
    ].join("\n");

    const result = await applyPatch.execute!({ patch }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: "Patch must not create or modify symbolic links or git submodules.",
      changedPaths: ["playwright"],
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalledWith(
      "git",
      expect.objectContaining({ args: expect.arrayContaining(["apply"]) }),
    );
  });

  it("rejects a headerless hunk that retargets a worktree symlink missing from the index", async () => {
    const { exec, repo, writeWorkspaceFile } = createRepoContext();
    exec.mockImplementation(async (command: string, options?: { args?: string[] }) => {
      const args = options?.args ?? [];
      if (command === "test" && args[0] === "-L" && args[1] === "playwright") {
        return { exitCode: 0, stdout: "", stderr: "", env: {} };
      }
      if (command === "test" && args[0] === "-L") {
        return { exitCode: 1, stdout: "", stderr: "", env: {} };
      }
      return { exitCode: 0, stdout: "", stderr: "", env: {} };
    });
    const applyPatch = createApplyPatchTool(createWriteContext(), repo);
    const patch = [
      "diff --git a/playwright b/playwright",
      "--- a/playwright",
      "+++ b/playwright",
      "@@ -1 +1 @@",
      "-old",
      "+../../outside",
      "",
    ].join("\n");

    const result = await applyPatch.execute!({ patch }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: "Patch must not create or modify symbolic links or git submodules.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalledWith(
      "git",
      expect.objectContaining({ args: expect.arrayContaining(["apply"]) }),
    );
  });
});
