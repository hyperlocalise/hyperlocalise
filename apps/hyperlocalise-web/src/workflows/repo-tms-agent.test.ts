import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "run_123" })),
}));

const {
  authMock,
  buildHyperlocaliseAgentInstructionsMock,
  buildToolsMock,
  createMock,
  generateMock,
  getInstallationOctokitMock,
  getMock,
  stopMock,
  toolLoopAgentCtor,
} = vi.hoisted(() => {
  const authMock = vi.fn(async () => ({ token: "installation-token" }));
  const buildHyperlocaliseAgentInstructionsMock = vi.fn(() => "sys");
  const buildToolsMock = vi.fn(() => ({}));
  const stopMock = vi.fn();
  const createMock = vi.fn(async () => ({ sandboxId: "sbx_1" }));
  const getMock = vi.fn(async () => ({ stop: stopMock }));
  const getInstallationOctokitMock = vi.fn(async () => ({ auth: authMock }));
  const generateMock = vi.fn(async () => ({ text: "done" }));
  const toolLoopAgentCtor = vi.fn(function ToolLoopAgent(_options: unknown) {
    return { generate: generateMock };
  });

  return {
    authMock,
    buildHyperlocaliseAgentInstructionsMock,
    buildToolsMock,
    createMock,
    generateMock,
    getInstallationOctokitMock,
    getMock,
    stopMock,
    toolLoopAgentCtor,
  };
});

vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: createMock, get: getMock } }));

vi.mock("ai", () => ({ ToolLoopAgent: toolLoopAgentCtor }));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

vi.mock("@/lib/agents/hyperlocalise-agent", () => ({
  getHyperlocaliseAgentModel: vi.fn(() => ({ modelId: "x" })),
  buildHyperlocaliseAgentInstructions: buildHyperlocaliseAgentInstructionsMock,
}));

vi.mock("@/lib/tools/registry", () => ({ buildTools: buildToolsMock }));

import { repoTmsAgentWorkflow } from "./repo-tms-agent";

const baseTask = {
  id: "task_1",
  source: "github",
  sourceThreadId: "thread_1",
  actor: { sourceUserId: "u1" },
  organizationId: "org_1",
  projectId: null,
  workMode: "read_only",
  instructions: "run checks",
  createdAt: "2026-01-01T00:00:00.000Z",
  idempotencyKey: "idem",
} as const;

describe("repoTmsAgentWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ token: "installation-token" });
    createMock.mockResolvedValue({ sandboxId: "sbx_1" });
    generateMock.mockResolvedValue({ text: "done" });
    getInstallationOctokitMock.mockResolvedValue({ auth: authMock });
    getMock.mockResolvedValue({ stop: stopMock });
    stopMock.mockResolvedValue(undefined);
  });

  it("returns success state with source target and workflowRunId", async () => {
    const result = await repoTmsAgentWorkflow(baseTask as never);

    expect(toolLoopAgentCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "sys",
        experimental_context: { sandboxId: null, repoTmsTaskId: "task_1" },
      }),
    );
    expect(generateMock).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "run checks" }],
    });
    expect(result).toEqual({
      ok: true,
      workflowRunId: "run_123",
      sourceReplyTarget: { source: "github", threadId: "thread_1" },
      summary: "done",
    });
  });

  it("cleans up disposable sandbox runs", async () => {
    await repoTmsAgentWorkflow({
      ...baseTask,
      githubContext: { resolved: true, installationId: 1, repositoryFullName: "acme/repo" },
    } as never);

    expect(getInstallationOctokitMock).toHaveBeenCalledWith(1);
    expect(authMock).toHaveBeenCalledWith({ type: "installation" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          password: "installation-token",
          username: "x-access-token",
        }),
      }),
    );
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("allows a larger repo task tool-call budget", async () => {
    await repoTmsAgentWorkflow(baseTask as never);

    const options = toolLoopAgentCtor.mock.calls[0]?.[0] as unknown as {
      stopWhen: Array<(step: { steps: unknown[] }) => boolean>;
    };
    const shouldStop = options.stopWhen[0];

    expect(shouldStop({ steps: Array.from({ length: 19 }) })).toBe(false);
    expect(shouldStop({ steps: Array.from({ length: 20 }) })).toBe(true);
  });

  it("uses member permissions when the task actor role is unresolved", async () => {
    await repoTmsAgentWorkflow(baseTask as never);

    expect(buildToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "task_1",
        workflowRunId: "run_123",
        organizationId: "org_1",
        membershipRole: "member",
        projectId: null,
        workMode: "read_only",
        repoTmsSource: "github",
        actor: baseTask.actor,
        sandboxId: null,
        githubContext: null,
      }),
    );
  });

  it.each([
    ["slack", "slack"],
    ["github", "github"],
    ["chat_ui", "web"],
  ] as const)("maps %s tasks to %s agent instructions", async (source, surface) => {
    await repoTmsAgentWorkflow({ ...baseTask, source } as never);

    expect(buildHyperlocaliseAgentInstructionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ surface }),
    );
  });

  it("adds read-only guidance to read-only repo workflows", async () => {
    await repoTmsAgentWorkflow({
      ...baseTask,
      githubContext: { resolved: true, installationId: 1, repositoryFullName: "acme/repo" },
    } as never);

    expect(buildHyperlocaliseAgentInstructionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalInstructions: expect.stringContaining(
          "This workflow is read-only. Gather repository and TMS context",
        ),
      }),
    );
  });

  it("captures failures from tool execution", async () => {
    generateMock.mockRejectedValueOnce(new Error("tool failed"));

    const result = await repoTmsAgentWorkflow(baseTask as never);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("tool failed");
  });

  it("cleans up write-mode sandbox runs", async () => {
    await repoTmsAgentWorkflow({
      ...baseTask,
      workMode: "write",
      githubContext: { resolved: true, installationId: 1, repositoryFullName: "acme/repo" },
    } as never);

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("passes repo-tms context fields to tools when github context is resolved", async () => {
    await repoTmsAgentWorkflow({
      ...baseTask,
      actor: { sourceUserId: "u1", role: "admin" },
      workMode: "approval_required",
      githubContext: {
        resolved: true,
        installationId: 1,
        repositoryFullName: "acme/repo",
        branch: "main",
      },
    } as never);

    expect(buildToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "task_1",
        workflowRunId: "run_123",
        organizationId: "org_1",
        membershipRole: "admin",
        projectId: null,
        workMode: "approval_required",
        repoTmsSource: "github",
        actor: { sourceUserId: "u1", role: "admin" },
        sandboxId: "sbx_1",
        githubContext: {
          resolved: true,
          installationId: 1,
          repositoryFullName: "acme/repo",
          branch: "main",
        },
      }),
    );
  });

  it("preserves the structured result when cleanup fails", async () => {
    stopMock.mockRejectedValueOnce(new Error("cleanup failed"));

    const result = await repoTmsAgentWorkflow({
      ...baseTask,
      githubContext: { resolved: true, installationId: 1, repositoryFullName: "acme/repo" },
    } as never);

    expect(result).toEqual({
      ok: true,
      workflowRunId: "run_123",
      sourceReplyTarget: { source: "github", threadId: "thread_1" },
      summary: "done",
    });
    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});
