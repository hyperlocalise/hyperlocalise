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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

const {
  listRecentWebChatMessagesMock,
  listWorkspaceAutomationKnowledgeFileContentsMock,
  reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsageMock,
  addInteractionMessageMock,
  getFileStorageAdapterMock,
  dbSelectMock,
  createRecallKnowledgeFilesToolMock,
  toolLoopAgentMock,
  getHyperlocaliseAgentModelMock,
} = vi.hoisted(() => ({
  listRecentWebChatMessagesMock: vi.fn(),
  listWorkspaceAutomationKnowledgeFileContentsMock: vi.fn(),
  reserveAgentRuntimeUsageMock: vi.fn(),
  trackSucceededAgentRuntimeUsageMock: vi.fn(),
  addInteractionMessageMock: vi.fn(),
  getFileStorageAdapterMock: vi.fn(),
  dbSelectMock: vi.fn(),
  createRecallKnowledgeFilesToolMock: vi.fn((_input?: unknown) => ({ execute: vi.fn() })),
  toolLoopAgentMock: vi.fn(),
  getHyperlocaliseAgentModelMock: vi.fn(() => "test-model"),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    ToolLoopAgent: toolLoopAgentMock,
  };
});

vi.mock("@/lib/agents/workspace-automation-web-chat", () => ({
  listRecentWebChatMessages: (...args: unknown[]) => listRecentWebChatMessagesMock(...args),
}));

vi.mock("@/lib/agents/workspace-automation-knowledge-files", () => ({
  listWorkspaceAutomationKnowledgeFileContents: (...args: unknown[]) =>
    listWorkspaceAutomationKnowledgeFileContentsMock(...args),
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  reserveAgentRuntimeUsage: (...args: unknown[]) => reserveAgentRuntimeUsageMock(...args),
  trackSucceededAgentRuntimeUsage: (...args: unknown[]) =>
    trackSucceededAgentRuntimeUsageMock(...args),
}));

vi.mock("@/lib/conversations/interactions", () => ({
  addInteractionMessage: (...args: unknown[]) => addInteractionMessageMock(...args),
}));

vi.mock("@/lib/file-storage/get-file-storage-adapter", () => ({
  getFileStorageAdapter: (...args: unknown[]) => getFileStorageAdapterMock(...args),
}));

vi.mock("@/lib/database/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: {
      select: (...args: unknown[]) => dbSelectMock(...args),
    },
  };
});

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: () => getHyperlocaliseAgentModelMock(),
}));

vi.mock("../tools/recall_knowledge_files", () => ({
  createRecallKnowledgeFilesTool: (input: { organizationId: string; automationId: string }) =>
    createRecallKnowledgeFilesToolMock(input),
}));

import { createWebChatAgentUIStreamResponse } from "./web-chat";

function automation(overrides?: Partial<WorkspaceAutomationRecord>): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Support bot",
    instructions: "Answer product questions.",
    model: "openai/gpt-5.6-luna",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: {},
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function readSseText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("missing response body");
  }

  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("createWebChatAgentUIStreamResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveAgentRuntimeUsageMock.mockResolvedValue(true);
    trackSucceededAgentRuntimeUsageMock.mockResolvedValue(undefined);
    addInteractionMessageMock.mockResolvedValue({ id: "msg_agent" });
    listWorkspaceAutomationKnowledgeFileContentsMock.mockResolvedValue([]);
    getFileStorageAdapterMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    });
    toolLoopAgentMock.mockImplementation(function ToolLoopAgent(this: unknown, settings: unknown) {
      return {
        settings,
        stream: vi.fn().mockResolvedValue({
          toUIMessageStream: () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        }),
      };
    });
  });

  it("streams a fallback and persists it when chat history is empty", async () => {
    listRecentWebChatMessagesMock.mockResolvedValue([]);

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv-1",
      lastUserMessageId: "msg-missing",
      automation: automation(),
    });

    const text = await readSseText(response);
    expect(text).toContain("Send a message to start chatting.");
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: "conv-1",
        senderType: "agent",
        text: "Send a message to start chatting.",
      }),
    );
    expect(toolLoopAgentMock).not.toHaveBeenCalled();
  });

  it("loads image attachments only for the latest user message", async () => {
    const imageBytes = new Uint8Array([1, 2, 3]);
    listRecentWebChatMessagesMock.mockResolvedValue([
      {
        id: "msg-old",
        senderType: "user",
        text: "old question",
        attachments: [{ id: "file-old", contentType: "image/png" }],
      },
      {
        id: "msg-new",
        senderType: "user",
        text: "new question",
        attachments: [{ id: "file-new", contentType: "image/png" }],
      },
    ]);

    const getStored = vi.fn().mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(imageBytes);
          controller.close();
        },
      }),
    });
    getFileStorageAdapterMock.mockReturnValue({ get: getStored });

    dbSelectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              storageKey: "files/file-new",
              contentType: "image/png",
            },
          ],
        }),
      }),
    });

    let capturedMessages: unknown;
    toolLoopAgentMock.mockImplementation(function ToolLoopAgent() {
      return {
        stream: vi.fn().mockImplementation(async ({ messages }) => {
          capturedMessages = messages;
          return {
            toUIMessageStream: () =>
              new ReadableStream({
                start(controller) {
                  controller.close();
                },
              }),
          };
        }),
      };
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv-1",
      lastUserMessageId: "msg-new",
      automation: automation(),
    });
    await readSseText(response);

    expect(capturedMessages).toEqual([
      { role: "user", content: "old question" },
      {
        role: "user",
        content: [
          { type: "text", text: "new question" },
          { type: "image", image: imageBytes, mediaType: "image/png" },
        ],
      },
    ]);
    expect(getStored).toHaveBeenCalledWith({ keyOrUrl: "files/file-new" });
  });

  it("omits recall_knowledge_files when knowledge files are disabled", async () => {
    listRecentWebChatMessagesMock.mockResolvedValue([
      { id: "msg-1", senderType: "user", text: "hello", attachments: [] },
    ]);

    let capturedSettings: { tools?: unknown; instructions?: string } | undefined;
    toolLoopAgentMock.mockImplementation(function ToolLoopAgent(settings: {
      tools?: unknown;
      instructions?: string;
    }) {
      capturedSettings = settings;
      return {
        stream: vi.fn().mockResolvedValue({
          toUIMessageStream: () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        }),
      };
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv-1",
      lastUserMessageId: "msg-1",
      automation: automation({ toolConfig: {} }),
    });
    await readSseText(response);

    expect(listWorkspaceAutomationKnowledgeFileContentsMock).not.toHaveBeenCalled();
    expect(capturedSettings?.tools).toBeUndefined();
    expect(capturedSettings?.instructions).toContain("No knowledge files are attached.");
    expect(createRecallKnowledgeFilesToolMock).not.toHaveBeenCalled();
  });

  it("exposes recall_knowledge_files when knowledge files are enabled and present", async () => {
    listRecentWebChatMessagesMock.mockResolvedValue([
      { id: "msg-1", senderType: "user", text: "hello", attachments: [] },
    ]);
    listWorkspaceAutomationKnowledgeFileContentsMock.mockResolvedValue([
      { filename: "faq.md", extractedText: "How do refunds work?" },
      { filename: "empty.pdf", extractedText: "   " },
    ]);

    let capturedSettings: { tools?: Record<string, unknown>; instructions?: string } | undefined;
    toolLoopAgentMock.mockImplementation(function ToolLoopAgent(settings: {
      tools?: Record<string, unknown>;
      instructions?: string;
    }) {
      capturedSettings = settings;
      return {
        stream: vi.fn().mockResolvedValue({
          toUIMessageStream: () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        }),
      };
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv-1",
      lastUserMessageId: "msg-1",
      automation: automation({
        toolConfig: { knowledgeFiles: { enabled: true } },
      }),
    });
    await readSseText(response);

    expect(capturedSettings?.tools).toHaveProperty("recall_knowledge_files");
    expect(capturedSettings?.instructions).toContain("faq.md (searchable)");
    expect(capturedSettings?.instructions).toContain("empty.pdf (no extracted text)");
    expect(createRecallKnowledgeFilesToolMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      automationId: "automation-1",
    });
  });
});
