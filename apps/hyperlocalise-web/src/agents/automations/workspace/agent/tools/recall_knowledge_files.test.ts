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

import { createRecallKnowledgeFilesTool } from "./recall_knowledge_files";

const mocks = vi.hoisted(() => ({
  listWorkspaceAutomationKnowledgeFileContents: vi.fn(),
  selectKnowledgeMemoryContext: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automation-knowledge-files", () => ({
  listWorkspaceAutomationKnowledgeFileContents: (...args: unknown[]) =>
    mocks.listWorkspaceAutomationKnowledgeFileContents(...args),
}));

vi.mock("@/lib/knowledge-memory/knowledge-memory-selection", () => ({
  selectKnowledgeMemoryContext: (...args: unknown[]) => mocks.selectKnowledgeMemoryContext(...args),
}));

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createRecallKnowledgeFilesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found when no knowledge files exist", async () => {
    mocks.listWorkspaceAutomationKnowledgeFileContents.mockResolvedValue([]);

    const payload = await createRecallKnowledgeFilesTool({
      organizationId: "org-1",
      automationId: "automation-1",
    }).execute!({ query: "refund policy" }, toolOptions);

    expect(payload).toEqual({ found: false, excerpts: [] });
    expect(mocks.selectKnowledgeMemoryContext).not.toHaveBeenCalled();
  });

  it("skips files with blank extracted text", async () => {
    mocks.listWorkspaceAutomationKnowledgeFileContents.mockResolvedValue([
      { filename: "empty.pdf", extractedText: "   " },
      { filename: "guide.md", extractedText: "Refunds are available within 30 days." },
    ]);
    mocks.selectKnowledgeMemoryContext.mockReturnValue({
      compactText: "Refunds are available within 30 days.",
    });

    const payload = await createRecallKnowledgeFilesTool({
      organizationId: "org-1",
      automationId: "automation-1",
    }).execute!({ query: "refund" }, toolOptions);

    expect(mocks.selectKnowledgeMemoryContext).toHaveBeenCalledTimes(1);
    expect(mocks.selectKnowledgeMemoryContext).toHaveBeenCalledWith({
      content: "Refunds are available within 30 days.",
      sourceText: "refund",
      context: "guide.md",
    });
    expect(payload).toEqual({
      found: true,
      excerpts: [
        {
          filename: "guide.md",
          content: "Refunds are available within 30 days.",
        },
      ],
    });
  });

  it("omits excerpts when selection returns blank compact text", async () => {
    mocks.listWorkspaceAutomationKnowledgeFileContents.mockResolvedValue([
      { filename: "guide.md", extractedText: "Unrelated product notes." },
    ]);
    mocks.selectKnowledgeMemoryContext.mockReturnValue({
      compactText: "  ",
    });

    const payload = await createRecallKnowledgeFilesTool({
      organizationId: "org-1",
      automationId: "automation-1",
    }).execute!({ query: "refund" }, toolOptions);

    expect(payload).toEqual({ found: false, excerpts: [] });
  });
});
