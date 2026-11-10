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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loadUploadedGuidelinesContextMock = vi.hoisted(() =>
  vi.fn(async (): Promise<UploadedGuidelinesContext> => ({ text: "", documents: [] })),
);

vi.mock("@/lib/knowledge-memory/uploaded-guidelines-context", () => ({
  loadUploadedGuidelinesContext: loadUploadedGuidelinesContextMock,
}));

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import type { UploadedGuidelinesContext } from "@/lib/knowledge-memory/uploaded-guidelines-context";

import { createGetKnowledgeMemoryTool } from "./knowledge-memory-tools";

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

describe("get_knowledge_memory agent tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUploadedGuidelinesContextMock.mockResolvedValue({ text: "", documents: [] });
  });

  it("returns matching organization guideline documents", async () => {
    loadUploadedGuidelinesContextMock.mockResolvedValueOnce({
      text: "### Brand guide\nNever translate Hyperlocalise.",
      documents: [
        {
          documentId: "doc-1",
          revisionId: "rev-1",
          version: 1,
          title: "Brand guide",
          mandatory: true,
        },
      ],
    });

    const result = await executeTool(createGetKnowledgeMemoryTool(createToolContext()), {
      query: "How should the brand name be translated?",
    });

    expect(result).toEqual({
      success: true,
      scope: "organization",
      found: true,
      guidelines: {
        text: "### Brand guide\nNever translate Hyperlocalise.",
        documents: [
          {
            documentId: "doc-1",
            revisionId: "rev-1",
            version: 1,
            title: "Brand guide",
            mandatory: true,
          },
        ],
      },
    });
    expect(loadUploadedGuidelinesContextMock).toHaveBeenCalledWith({
      organizationId: "organization_1",
      projectId: undefined,
      targetLocales: [],
      sourceText: "How should the brand name be translated?",
    });
  });

  it("searches project guideline documents when a project is in context", async () => {
    const result = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ projectId: "project_1" })),
      { query: "checkout tone", scope: "project" },
    );

    expect(result).toMatchObject({ success: true, scope: "project", found: false });
    expect(loadUploadedGuidelinesContextMock).toHaveBeenCalledWith({
      organizationId: "organization_1",
      projectId: "project_1",
      targetLocales: [],
      sourceText: "checkout tone",
    });
  });

  it("does not search project documents without a project in context", async () => {
    const result = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ projectId: null })),
      { query: "checkout tone", scope: "project" },
    );

    expect(result).toMatchObject({
      success: false,
      code: "knowledge_memory_project_unavailable",
    });
    expect(loadUploadedGuidelinesContextMock).not.toHaveBeenCalled();
  });

  it("reports found: false without an error when no document matches", async () => {
    const result = await executeTool(createGetKnowledgeMemoryTool(createToolContext()), {
      query: "something unrelated",
    });

    expect(result).toEqual({
      success: true,
      scope: "organization",
      found: false,
      guidelines: { text: "", documents: [] },
    });
  });

  it("fails closed without searching when the capability is disabled or omitted", async () => {
    const disabled = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ knowledgeMemoryEnabled: false })),
      { query: "brand name" },
    );
    const omitted = await executeTool(
      createGetKnowledgeMemoryTool(createToolContext({ knowledgeMemoryEnabled: undefined })),
      { query: "brand name" },
    );

    expect(disabled).toMatchObject({
      success: false,
      code: "knowledge_memory_unavailable",
    });
    expect(omitted).toMatchObject({
      success: false,
      code: "knowledge_memory_unavailable",
    });
    expect(loadUploadedGuidelinesContextMock).not.toHaveBeenCalled();
  });
});
