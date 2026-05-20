import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "run_123" })),
}));

const stopMock = vi.fn();
const createMock = vi.fn(async () => ({ sandboxId: "sbx_1" }));
const getMock = vi.fn(async () => ({ stop: stopMock }));

vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: createMock, get: getMock } }));

const generateMock = vi.fn(async () => ({ text: "done" }));
const toolLoopAgentCtor = vi.fn(function ToolLoopAgent() {
  return { generate: generateMock };
});
vi.mock("ai", () => ({ ToolLoopAgent: toolLoopAgentCtor }));

vi.mock("@/lib/agents/hyperlocalise-agent", () => ({
  getHyperlocaliseAgentModel: vi.fn(() => ({ modelId: "x" })),
  buildHyperlocaliseAgentInstructions: vi.fn(() => "sys"),
}));

vi.mock("@/lib/tools/registry", () => ({ buildTools: vi.fn(() => ({})) }));

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
    createMock.mockResolvedValue({ sandboxId: "sbx_1" });
    generateMock.mockResolvedValue({ text: "done" });
  });

  it("returns success state with source target and workflowRunId", async () => {
    const result = await repoTmsAgentWorkflow(baseTask as never);

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

    expect(createMock).toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("captures failures from tool execution", async () => {
    generateMock.mockRejectedValueOnce(new Error("tool failed"));

    const result = await repoTmsAgentWorkflow(baseTask as never);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("tool failed");
  });

  it("keeps write-mode sandbox available", async () => {
    await repoTmsAgentWorkflow({
      ...baseTask,
      workMode: "write",
      githubContext: { resolved: true, installationId: 1, repositoryFullName: "acme/repo" },
    } as never);

    expect(stopMock).not.toHaveBeenCalled();
  });
});
