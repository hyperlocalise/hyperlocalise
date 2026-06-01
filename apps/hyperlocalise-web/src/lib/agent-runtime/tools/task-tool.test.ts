import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { runSubagentMock } = vi.hoisted(() => ({
  runSubagentMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/subagents/run-subagent", () => ({
  runSubagent: runSubagentMock,
}));

vi.mock("@/lib/agent-runtime/subagents/definitions", () => ({
  SUBAGENT_TYPES: ["translation", "repository"],
  buildSubagentSummaryLines: () =>
    "- `translation` — translate files\n- `repository` — search repo",
  SUBAGENT_REGISTRY: {
    translation: {
      shortDescription: "translate files",
      isAvailable: () => true,
      unavailableMessage: () => "Attach a file.",
    },
    repository: {
      shortDescription: "search repo",
      isAvailable: (runtime: { toolContext: { sandboxId?: string | null } }) =>
        Boolean(runtime.toolContext.sandboxId),
      unavailableMessage: () => "Connect GitHub.",
    },
  },
}));

import { createTaskTool } from "./task-tool";

function createToolExecutionOptions(
  experimental_context: Record<string, unknown>,
): ToolExecutionOptions {
  return {
    toolCallId: "tool_call_test",
    messages: [],
    experimental_context,
  };
}

describe("task tool", () => {
  beforeEach(() => {
    runSubagentMock.mockReset();
  });

  it("delegates to the translation subagent and returns its summary", async () => {
    runSubagentMock.mockResolvedValueOnce({ text: "Queued job job_123 for fr-FR." });

    const taskTool = createTaskTool();
    const result = await taskTool.execute!(
      {
        subagentType: "translation",
        task: "Translate attached JSON",
        instructions: "Target fr-FR. sourceFileId=file_1.",
      },
      createToolExecutionOptions({
        surface: "web",
        suggestedIntents: ["translation"],
        suggestedMode: "translation",
        hasFileAttachments: true,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
        },
      }),
    );

    expect(runSubagentMock).toHaveBeenCalledWith(
      "translation",
      expect.objectContaining({
        task: "Translate attached JSON",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      subagentType: "translation",
      summary: "Queued job job_123 for fr-FR.",
    });
  });

  it("returns structured failure when the subagent throws", async () => {
    runSubagentMock.mockRejectedValueOnce(new Error("rate limit exceeded"));

    const taskTool = createTaskTool();
    const result = await taskTool.execute!(
      {
        subagentType: "translation",
        task: "Translate attached JSON",
        instructions: "Target fr-FR.",
      },
      createToolExecutionOptions({
        surface: "web",
        suggestedIntents: ["translation"],
        suggestedMode: "translation",
        hasFileAttachments: true,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
        },
      }),
    );

    expect(result).toMatchObject({
      success: false,
      subagentType: "translation",
      summary: "Agent encountered an error.",
      error: "rate limit exceeded",
    });
  });

  it("returns unavailable when repository search has no sandbox", async () => {
    const taskTool = createTaskTool();
    const result = await taskTool.execute!(
      {
        subagentType: "repository",
        task: "Find Email agent string",
        instructions: "Search for 'Email agent'.",
      },
      createToolExecutionOptions({
        surface: "slack",
        suggestedIntents: ["repository"],
        suggestedMode: "repository",
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
        },
      }),
    );

    expect(runSubagentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error: "subagent_unavailable",
    });
  });

  it("returns structured failure when request context is incomplete", async () => {
    const taskTool = createTaskTool();
    const result = await taskTool.execute!(
      {
        subagentType: "translation",
        task: "Translate attached JSON",
        instructions: "Target fr-FR.",
      },
      createToolExecutionOptions({}),
    );

    expect(runSubagentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      subagentType: "translation",
      summary: "Agent cannot run without request context.",
      error: "Hyperlocalise agent runtime context is incomplete.",
    });
  });

  it("adds localization-context handoff requirements for the repository agent", async () => {
    runSubagentMock.mockResolvedValueOnce({ text: "Found context in src/messages.ts:12." });

    const taskTool = createTaskTool();
    await taskTool.execute!(
      {
        subagentType: "repository",
        task: "Find Email agent string context",
        instructions: "Search for 'Email agent'.",
      },
      createToolExecutionOptions({
        surface: "slack",
        suggestedIntents: ["repository"],
        suggestedMode: "repository",
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
          sandboxId: "sbx_1",
        },
      }),
    );

    expect(runSubagentMock).toHaveBeenCalledWith(
      "repository",
      expect.objectContaining({
        instructions: expect.stringContaining("product surface"),
      }),
    );
    expect(runSubagentMock).toHaveBeenCalledWith(
      "repository",
      expect.objectContaining({
        instructions: expect.stringContaining("Do not ask for code changes"),
      }),
    );
  });
});
