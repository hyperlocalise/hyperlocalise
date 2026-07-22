import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { commitKnowledgeMemoryMock, getKnowledgeMemoryMock } = vi.hoisted(() => ({
  commitKnowledgeMemoryMock: vi.fn(),
  getKnowledgeMemoryMock: vi.fn(),
}));

vi.mock("@/lib/knowledge-memory/knowledge-memory", () => ({
  commitKnowledgeMemoryForOrganization: commitKnowledgeMemoryMock,
  getKnowledgeMemoryForOrganization: getKnowledgeMemoryMock,
}));

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { err, ok } from "@/lib/primitives/result/results";

import {
  createGetKnowledgeMemoryTool,
  createUpdateKnowledgeMemoryTool,
  updateKnowledgeMemoryToolInputSchema,
} from "./knowledge-memory-tools";

const currentMemory = {
  revisionId: "11111111-1111-4111-8111-111111111111",
  version: 4,
  content: "# Memory.md\n\n## Voice\nBe clear.\n\n## Legal\nPreserve legal text.",
  summary: "Current guidance",
  updatedAt: "2026-07-22T01:00:00.000Z",
  updatedByUserId: "user_previous",
};

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conversation_1",
    organizationId: "organization_1",
    localUserId: "user_1",
    membershipRole: "admin",
    projectId: null,
    db: {} as ToolContext["db"],
    knowledgeMemoryEnabled: true,
    ...overrides,
  };
}

async function executeTool(tool: unknown, input: unknown) {
  const execute = (tool as { execute?: (value: unknown, options: unknown) => unknown }).execute;
  if (!execute) {
    throw new Error("tool is not executable");
  }

  return execute(input, { toolCallId: "tool_call_1", messages: [] });
}

describe("Knowledge Memory agent tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnowledgeMemoryMock.mockResolvedValue(currentMemory);
    commitKnowledgeMemoryMock.mockResolvedValue(
      ok({
        changed: true,
        knowledgeMemory: {
          ...currentMemory,
          revisionId: "22222222-2222-4222-8222-222222222222",
          version: 5,
          content: "# Memory.md\n\n## Voice\nBe concise.\n\n## Legal\nPreserve legal text.",
          summary: "Tighten voice guidance",
          updatedByUserId: "user_1",
        },
      }),
    );
  });

  it("returns the complete organization document and revision metadata", async () => {
    const result = await executeTool(createGetKnowledgeMemoryTool(createToolContext()), {});

    expect(result).toEqual({ success: true, knowledgeMemory: currentMemory });
    expect(getKnowledgeMemoryMock).toHaveBeenCalledWith("organization_1");
  });

  it("creates the first version from an empty organization document", async () => {
    const emptyMemory = {
      revisionId: null,
      version: 0,
      content: "",
      summary: null,
      updatedAt: null,
      updatedByUserId: null,
    };
    getKnowledgeMemoryMock.mockResolvedValueOnce(emptyMemory);
    commitKnowledgeMemoryMock.mockResolvedValueOnce(
      ok({
        changed: true,
        knowledgeMemory: {
          ...emptyMemory,
          revisionId: "22222222-2222-4222-8222-222222222222",
          version: 1,
          content: "# Memory.md\n\nUse sentence case.",
          summary: "Add initial style guidance",
          updatedAt: "2026-07-22T02:00:00.000Z",
          updatedByUserId: "user_1",
        },
      }),
    );

    const result = await executeTool(createUpdateKnowledgeMemoryTool(createToolContext()), {
      expectedRevisionId: null,
      summary: "Add initial style guidance",
      edits: [{ operation: "append", insertText: "# Memory.md\n\nUse sentence case." }],
    });

    expect(result).toMatchObject({ success: true, changed: true, version: 1 });
    expect(commitKnowledgeMemoryMock).toHaveBeenCalledWith({
      organizationId: "organization_1",
      updatedByUserId: "user_1",
      expectedRevisionId: null,
      content: "# Memory.md\n\nUse sentence case.",
      summary: "Add initial style guidance",
    });
  });

  it("fails closed without reading when the capability is disabled or omitted", async () => {
    const disabled = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ knowledgeMemoryEnabled: false })),
      {},
    );
    const omitted = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ knowledgeMemoryEnabled: undefined })),
      {},
    );

    expect(disabled).toMatchObject({
      success: false,
      code: "knowledge_memory_unavailable",
    });
    expect(omitted).toMatchObject({
      success: false,
      code: "knowledge_memory_unavailable",
    });
    expect(getKnowledgeMemoryMock).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    "fails closed without reading or committing an update when the capability is %s",
    async (knowledgeMemoryEnabled) => {
      const result = await executeTool(
        createUpdateKnowledgeMemoryTool(createToolContext({ knowledgeMemoryEnabled })),
        {
          expectedRevisionId: currentMemory.revisionId,
          summary: "Blocked update",
          edits: [{ operation: "append", insertText: "Do not save this." }],
        },
      );

      expect(result).toMatchObject({
        success: false,
        code: "knowledge_memory_unavailable",
      });
      expect(getKnowledgeMemoryMock).not.toHaveBeenCalled();
      expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
    },
  );

  it("validates revision, summary, and edit-count boundaries", () => {
    const validInput = {
      expectedRevisionId: currentMemory.revisionId,
      summary: "Add checkout guidance",
      edits: [{ operation: "append" as const, insertText: "Use short checkout labels." }],
    };

    expect(updateKnowledgeMemoryToolInputSchema.safeParse(validInput).success).toBe(true);
    expect(
      updateKnowledgeMemoryToolInputSchema.safeParse({
        ...validInput,
        expectedRevisionId: "not-a-revision-id",
      }).success,
    ).toBe(false);
    expect(
      updateKnowledgeMemoryToolInputSchema.safeParse({ ...validInput, summary: "   " }).success,
    ).toBe(false);
    expect(
      updateKnowledgeMemoryToolInputSchema.safeParse({
        ...validInput,
        edits: Array.from({ length: 11 }, () => validInput.edits[0]),
      }).success,
    ).toBe(false);
  });

  it.each(["admin", "localization_manager"] as const)(
    "applies exact edits immediately for a %s and preserves unrelated markdown",
    async (membershipRole) => {
      const result = await executeTool(
        createUpdateKnowledgeMemoryTool(createToolContext({ membershipRole })),
        {
          expectedRevisionId: currentMemory.revisionId,
          summary: "Tighten voice guidance",
          edits: [
            {
              operation: "replace",
              matchText: "Be clear.",
              replacementText: "Be concise.",
            },
          ],
        },
      );

      expect(result).toEqual({
        success: true,
        changed: true,
        revisionId: "22222222-2222-4222-8222-222222222222",
        version: 5,
        summary: "Tighten voice guidance",
      });
      expect(commitKnowledgeMemoryMock).toHaveBeenCalledWith({
        organizationId: "organization_1",
        updatedByUserId: "user_1",
        expectedRevisionId: currentMemory.revisionId,
        content: "# Memory.md\n\n## Voice\nBe concise.\n\n## Legal\nPreserve legal text.",
        summary: "Tighten voice guidance",
      });
    },
  );

  it.each(["developer", "reviewer", "translator"] as const)(
    "does not read or write for a %s update request",
    async (membershipRole) => {
      const result = await executeTool(
        createUpdateKnowledgeMemoryTool(createToolContext({ membershipRole })),
        {
          expectedRevisionId: currentMemory.revisionId,
          summary: "Unauthorized update",
          edits: [{ operation: "append", insertText: "Do not save this." }],
        },
      );

      expect(result).toMatchObject({
        success: false,
        code: "knowledge_memory_permission_denied",
      });
      expect(getKnowledgeMemoryMock).not.toHaveBeenCalled();
      expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
    },
  );

  it("returns a no-op without inventing a new version", async () => {
    commitKnowledgeMemoryMock.mockResolvedValueOnce(
      ok({ changed: false, knowledgeMemory: currentMemory }),
    );

    const result = await executeTool(createUpdateKnowledgeMemoryTool(createToolContext()), {
      expectedRevisionId: currentMemory.revisionId,
      summary: "No effective change",
      edits: [
        {
          operation: "replace",
          matchText: "Be clear.",
          replacementText: "Be clear.",
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      changed: false,
      revisionId: currentMemory.revisionId,
      version: 4,
    });
  });

  it("rejects a stale revision before applying or committing edits", async () => {
    const result = await executeTool(createUpdateKnowledgeMemoryTool(createToolContext()), {
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      summary: "Stale update",
      edits: [{ operation: "append", insertText: "Do not save this." }],
    });

    expect(result).toMatchObject({
      success: false,
      code: "knowledge_memory_conflict",
      currentRevisionId: currentMemory.revisionId,
      currentVersion: 4,
    });
    expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
  });

  it("maps a commit-time race to a conflict without retrying", async () => {
    const latestMemory = {
      ...currentMemory,
      revisionId: "44444444-4444-4444-8444-444444444444",
      version: 5,
    };
    commitKnowledgeMemoryMock.mockResolvedValueOnce(
      err({ code: "precondition_failed", current: latestMemory }),
    );

    const result = await executeTool(createUpdateKnowledgeMemoryTool(createToolContext()), {
      expectedRevisionId: currentMemory.revisionId,
      summary: "Racing update",
      edits: [{ operation: "append", insertText: "Do not overwrite the race." }],
    });

    expect(result).toMatchObject({
      success: false,
      code: "knowledge_memory_conflict",
      currentRevisionId: latestMemory.revisionId,
      currentVersion: 5,
    });
    expect(commitKnowledgeMemoryMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      matchText: "Missing text",
      code: "knowledge_memory_edit_target_not_found",
    },
    {
      matchText: "Memory.md",
      code: "knowledge_memory_edit_target_ambiguous",
      content: "Memory.md and Memory.md",
    },
  ])("does not commit when an exact edit target is invalid", async (fixture) => {
    if (fixture.content) {
      getKnowledgeMemoryMock.mockResolvedValueOnce({ ...currentMemory, content: fixture.content });
    }

    const result = await executeTool(createUpdateKnowledgeMemoryTool(createToolContext()), {
      expectedRevisionId: currentMemory.revisionId,
      summary: "Invalid exact edit",
      edits: [{ operation: "delete", matchText: fixture.matchText }],
    });

    expect(result).toMatchObject({ success: false, code: fixture.code, editIndex: 0 });
    expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
  });
});
