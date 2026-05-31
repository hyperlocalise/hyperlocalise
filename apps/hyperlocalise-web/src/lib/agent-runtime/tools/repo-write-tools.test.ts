import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { sandboxGetMock } = vi.hoisted(() => ({
  sandboxGetMock: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: sandboxGetMock,
  },
}));

const { checkRepositoryWriteGateMock, canPushToGitHubBranchMock } = vi.hoisted(() => ({
  checkRepositoryWriteGateMock: vi.fn(),
  canPushToGitHubBranchMock: vi.fn(),
}));

vi.mock("@/lib/agent-contracts/write-gate", () => ({
  checkRepositoryWriteGate: checkRepositoryWriteGateMock,
}));

vi.mock("@/lib/agents/repository-write-gate", () => ({
  canPushToGitHubBranch: canPushToGitHubBranchMock,
}));

const { createStoredFileMock, createRepositorySourceFileVersionMock, deleteStoredObjectMock } =
  vi.hoisted(() => ({
    createStoredFileMock: vi.fn(),
    createRepositorySourceFileVersionMock: vi.fn(),
    deleteStoredObjectMock: vi.fn(),
  }));

vi.mock("@/lib/file-storage", () => ({
  getFileStorageAdapter: vi.fn(() => ({
    provider: "vercel_blob",
    delete: deleteStoredObjectMock,
  })),
}));

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    createStoredFile: createStoredFileMock,
    createRepositorySourceFileVersion: createRepositorySourceFileVersionMock,
  };
});

import {
  createApplyHyperlocaliseFixesTool,
  createCommitChangesTool,
  createPushToBranchTool,
  createUploadSourcesTool,
  getCommittableChangedPaths,
} from "./repo-write-tools";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

function createBaseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([])),
    })),
    transaction: vi.fn((callback) => callback(db)),
  } as unknown as ToolContext["db"];

  return {
    conversationId: "task_1",
    workflowRunId: "run_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "member",
    projectId: "proj_1",
    db,
    workMode: "approval_required",
    repositorySource: "slack",
    actor: { sourceUserId: "U1", role: "member" },
    sandboxId: "sbx_1",
    githubContext: {
      resolved: true,
      installationId: 123,
      repositoryFullName: "owner/repo",
      branch: "main",
    },
    ...overrides,
  };
}

describe("createApplyHyperlocaliseFixesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRepositoryWriteGateMock.mockReturnValue({ allowed: true });
  });

  it("passes the explicit repository source to the write gate", async () => {
    const tool = createApplyHyperlocaliseFixesTool(
      createBaseCtx({
        repositorySource: "chat_ui",
        actor: { sourceUserId: "user_1", role: "member" },
      }),
    );

    await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    );

    expect(checkRepositoryWriteGateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "chat_ui",
        actor: { sourceUserId: "user_1", role: "member" },
      }),
    );
  });

  it("denies the fix when the write gate rejects it", async () => {
    checkRepositoryWriteGateMock.mockReturnValue({
      allowed: false,
      reason: "Approval required",
    });

    const tool = createApplyHyperlocaliseFixesTool(createBaseCtx());
    const result = (await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("Approval required");
  });

  it("logs the repository source and workflow run id", async () => {
    const valuesMock = vi.fn(() => Promise.resolve([]));
    const db = {
      insert: vi.fn(() => ({
        values: valuesMock,
      })),
      transaction: vi.fn(),
    } as unknown as ToolContext["db"];
    checkRepositoryWriteGateMock.mockReturnValue({
      allowed: false,
      reason: "Approval required",
    });

    const tool = createApplyHyperlocaliseFixesTool(
      createBaseCtx({
        db,
        conversationId: "task_1",
        workflowRunId: "run_123",
        repositorySource: "github",
      }),
    );

    await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    );

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "run_123",
        taskId: "task_1",
        source: "github",
      }),
    );
  });

  it("returns error when no sandbox is available", async () => {
    const tool = createApplyHyperlocaliseFixesTool(createBaseCtx({ sandboxId: null }));
    const result = (await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No repository sandbox");
  });

  it("runs the fix command and returns success", async () => {
    const runCommandMock = vi.fn(async () => ({
      exitCode: 0,
      output: vi.fn(async () => "fixed 3 entries"),
    }));
    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createApplyHyperlocaliseFixesTool(createBaseCtx());
    const result = (await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; output: string };

    expect(result.success).toBe(true);
    expect(result.output).toBe("fixed 3 entries");
    expect(runCommandMock).toHaveBeenCalled();
  });

  it("returns error when the fix command fails", async () => {
    const runCommandMock = vi.fn(async () => ({
      exitCode: 1,
      output: vi.fn(async () => "command not found"),
    }));
    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createApplyHyperlocaliseFixesTool(createBaseCtx());
    const result = (await tool.execute!(
      { scope: "all" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Fix command failed");
  });
});

describe("createCommitChangesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRepositoryWriteGateMock.mockReturnValue({ allowed: true });
  });

  it("denies commit when the write gate rejects it", async () => {
    checkRepositoryWriteGateMock.mockReturnValue({
      allowed: false,
      reason: "read-only mode",
    });

    const tool = createCommitChangesTool(createBaseCtx());
    const result = (await tool.execute!(
      { message: "custom" },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("read-only mode");
  });

  it("returns changed=false when there are no changes to commit", async () => {
    const runCommandMock = vi.fn(async () => ({
      exitCode: 0,
      output: vi.fn(async () => ""),
    }));
    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createCommitChangesTool(createBaseCtx());
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; changed: boolean };

    expect(result.success).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("commits changed files and returns changed paths", async () => {
    const runCommandMock = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        output: vi.fn(async () => " M src/i18n/en.json\0?? src/i18n/fr.json\0"),
      })
      .mockResolvedValueOnce({ exitCode: 0, output: vi.fn(async () => "") })
      .mockResolvedValueOnce({
        exitCode: 0,
        output: vi.fn(async () => "[main abc123] fix(i18n): apply hyperlocalise fixes"),
      });

    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createCommitChangesTool(createBaseCtx());
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; changed: boolean; changedPaths: string[] };

    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.changedPaths).toContain("src/i18n/en.json");
    expect(result.changedPaths).toContain("src/i18n/fr.json");
  });
});

describe("createPushToBranchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRepositoryWriteGateMock.mockReturnValue({ allowed: true });
    canPushToGitHubBranchMock.mockResolvedValue({ canPush: true });
  });

  it("denies push when the write gate rejects it", async () => {
    checkRepositoryWriteGateMock.mockReturnValue({
      allowed: false,
      reason: "Approval required",
    });

    const tool = createPushToBranchTool(createBaseCtx());
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("Approval required");
  });

  it("denies push when the GitHub installation lacks push access", async () => {
    canPushToGitHubBranchMock.mockResolvedValue({
      canPush: false,
      reason: "No push access",
    });

    const tool = createPushToBranchTool(createBaseCtx());
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("No push access");
  });

  it("returns error when no github context is available", async () => {
    const tool = createPushToBranchTool(createBaseCtx({ githubContext: null }));
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No GitHub context");
  });

  it("pushes successfully when all checks pass", async () => {
    const runCommandMock = vi.fn(async () => ({
      exitCode: 0,
      output: vi.fn(async () => "pushed to origin"),
    }));
    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createPushToBranchTool(createBaseCtx());
    const result = (await tool.execute!(
      {},
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; branch: string };

    expect(result.success).toBe(true);
    expect(result.branch).toBe("main");
  });
});

describe("getCommittableChangedPaths", () => {
  it("uses rename and copy destination paths from porcelain v1 z output", () => {
    const paths = getCommittableChangedPaths(
      "R  src/i18n/en-old.json\0src/i18n/en.json\0C  src/i18n/fr.json\0src/i18n/fr-copy.json\0",
    );

    expect(paths).toEqual(["src/i18n/en.json", "src/i18n/fr-copy.json"]);
  });

  it("skips internal report destinations for rename and copy entries", () => {
    const paths = getCommittableChangedPaths(
      "R  src/report.md\0.hyperlocalise/report.md\0 M src/i18n/en.json\0",
    );

    expect(paths).toEqual(["src/i18n/en.json"]);
  });
});

describe("createUploadSourcesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRepositoryWriteGateMock.mockReturnValue({ allowed: true });
    createStoredFileMock.mockImplementation(async (input) => ({
      id: `file_${input.filename}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      storageKey: `test/${input.filename}`,
      filename: input.filename,
      contentType: input.contentType,
      sha256: "sha",
    }));
    createRepositorySourceFileVersionMock.mockImplementation(async (input) => ({
      id: `version_${input.storedFile.id}`,
      storedFileId: input.storedFile.id,
      sourcePath: input.sourcePath,
    }));
  });

  it("denies upload when the write gate rejects it", async () => {
    checkRepositoryWriteGateMock.mockReturnValue({
      allowed: false,
      reason: "read-only mode",
    });

    const tool = createUploadSourcesTool(createBaseCtx());
    const result = (await tool.execute!(
      { paths: ["src/i18n/en.json"] },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("read-only mode");
  });

  it("returns error when no project is attached", async () => {
    const tool = createUploadSourcesTool(createBaseCtx({ projectId: null }));
    const result = (await tool.execute!(
      { paths: ["src/i18n/en.json"] },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No project");
  });

  it("uploads files and returns success", async () => {
    const runCommandMock = vi.fn(async () => ({
      exitCode: 0,
      output: vi.fn(async () => '{"hello":"Hello"}'),
    }));
    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createUploadSourcesTool(createBaseCtx());
    const result = (await tool.execute!(
      { paths: ["src/i18n/en.json", "src/i18n/fr.json"] },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as {
      success: boolean;
      uploaded: Array<{ path: string; fileId: string; sourceFileVersionId: string }>;
    };

    expect(result.success).toBe(true);
    expect(result.uploaded).toEqual([
      {
        path: "src/i18n/en.json",
        fileId: "file_en.json",
        sourceFileVersionId: "version_file_en.json",
      },
      {
        path: "src/i18n/fr.json",
        fileId: "file_fr.json",
        sourceFileVersionId: "version_file_fr.json",
      },
    ]);
    expect(createStoredFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "proj_1",
        role: "source",
        sourceKind: "repository_file",
        filename: "en.json",
        contentType: "application/json",
        content: Buffer.from('{"hello":"Hello"}'),
        metadata: expect.objectContaining({
          sourcePath: "src/i18n/en.json",
          workflowRunId: "run_1",
          uploadSurface: "repository_agent",
        }),
      }),
    );
    expect(createRepositorySourceFileVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "src/i18n/en.json",
        workflowRunId: "run_1",
        uploadSurface: "repository_agent",
      }),
    );
  });

  it("returns error when a file cannot be read", async () => {
    const runCommandMock = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, output: vi.fn(async () => '{"hello":"Hello"}') })
      .mockResolvedValueOnce({ exitCode: 1, output: vi.fn(async () => "No such file") });

    sandboxGetMock.mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createUploadSourcesTool(createBaseCtx());
    const result = (await tool.execute!(
      { paths: ["src/i18n/en.json", "src/i18n/missing.json"] },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to read");
  });
});
