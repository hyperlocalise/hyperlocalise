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
});
