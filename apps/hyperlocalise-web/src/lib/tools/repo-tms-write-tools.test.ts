import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: vi.fn(),
  },
}));

const { checkRepoTmsWriteGateMock, canPushToGitHubBranchMock } = vi.hoisted(() => ({
  checkRepoTmsWriteGateMock: vi.fn(),
  canPushToGitHubBranchMock: vi.fn(),
}));

vi.mock("@/lib/agents/repo-tms-write-gate", () => ({
  checkRepoTmsWriteGate: checkRepoTmsWriteGateMock,
  canPushToGitHubBranch: canPushToGitHubBranchMock,
}));

import { Sandbox } from "@vercel/sandbox";
import {
  createApplyHyperlocaliseFixesTool,
  createCommitChangesTool,
  createPushToBranchTool,
  createUploadSourcesTool,
} from "./repo-tms-write-tools";
import type { ToolContext } from "./types";

function createBaseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "task_1",
    organizationId: "org_1",
    membershipRole: "member",
    projectId: "proj_1",
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve([])),
      })),
    } as unknown as ToolContext["db"],
    workMode: "approval_required",
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
    checkRepoTmsWriteGateMock.mockReturnValue({ allowed: true });
  });

  it("denies the fix when the write gate rejects it", async () => {
    checkRepoTmsWriteGateMock.mockReturnValue({
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
    vi.mocked(Sandbox.get).mockResolvedValue({
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
    vi.mocked(Sandbox.get).mockResolvedValue({
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
    checkRepoTmsWriteGateMock.mockReturnValue({ allowed: true });
  });

  it("denies commit when the write gate rejects it", async () => {
    checkRepoTmsWriteGateMock.mockReturnValue({
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
    vi.mocked(Sandbox.get).mockResolvedValue({
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

    vi.mocked(Sandbox.get).mockResolvedValue({
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
    checkRepoTmsWriteGateMock.mockReturnValue({ allowed: true });
    canPushToGitHubBranchMock.mockResolvedValue({ canPush: true });
  });

  it("denies push when the write gate rejects it", async () => {
    checkRepoTmsWriteGateMock.mockReturnValue({
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
    vi.mocked(Sandbox.get).mockResolvedValue({
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

describe("createUploadSourcesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRepoTmsWriteGateMock.mockReturnValue({ allowed: true });
  });

  it("denies upload when the write gate rejects it", async () => {
    checkRepoTmsWriteGateMock.mockReturnValue({
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
    vi.mocked(Sandbox.get).mockResolvedValue({
      runCommand: runCommandMock,
    } as never);

    const tool = createUploadSourcesTool(createBaseCtx());
    const result = (await tool.execute!(
      { paths: ["src/i18n/en.json", "src/i18n/fr.json"] },
      { messages: [], toolCallId: "tc1", abortSignal: new AbortController().signal },
    )) as { success: boolean; uploaded: string[] };

    expect(result.success).toBe(true);
    expect(result.uploaded).toEqual(["src/i18n/en.json", "src/i18n/fr.json"]);
  });

  it("returns error when a file cannot be read", async () => {
    const runCommandMock = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, output: vi.fn(async () => '{"hello":"Hello"}') })
      .mockResolvedValueOnce({ exitCode: 1, output: vi.fn(async () => "No such file") });

    vi.mocked(Sandbox.get).mockResolvedValue({
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
