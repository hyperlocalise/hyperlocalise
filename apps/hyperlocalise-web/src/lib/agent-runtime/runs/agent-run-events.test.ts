import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Thread } from "chat";

const { createStoredFileMock, whereMock } = vi.hoisted(() => ({
  createStoredFileMock: vi.fn(),
  whereMock: vi.fn(),
}));

vi.mock("@/lib/conversations/interactions", () => ({
  addInteractionMessage: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: whereMock,
      })),
    })),
  },
  schema: {
    interactions: {
      id: "interaction_id",
      organizationId: "organization_id",
      projectId: "project_id",
    },
  },
}));

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile: createStoredFileMock,
}));

import { postThreadMessageWithoutTracking, wrapThreadPostForInteraction } from "./agent-run-events";

function createThread() {
  const posts: unknown[] = [];
  const thread = {
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
  } as unknown as Thread<Record<string, unknown>>;

  return { posts, thread };
}

describe("wrapThreadPostForInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({
      limit: vi.fn(async () => [
        {
          organizationId: "org_123",
          projectId: "project_123",
        },
      ]),
    });
    createStoredFileMock.mockResolvedValue({
      id: "file_123",
      filename: "banner-fr.webp",
      contentType: "image/webp",
      storageUrl: "https://files.example/banner-fr.webp",
      downloadUrl: "https://files.example/banner-fr.webp?download=1",
    });
  });

  it("persists string agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post("Agent reply");

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("persists markdown object agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ markdown: "complex" });

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "complex",
    });
  });

  it("does not persist posts without text content", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ card: { type: "card", children: [] } });

    expect(addMessage).not.toHaveBeenCalled();
  });

  it("persists raw object agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ raw: "Agent reply", files: [] });

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("persists posted files as agent message attachments", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();
    const imageData = Buffer.from("image");

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({
      raw: "Here is the localized image",
      files: [{ data: imageData, filename: "banner-fr.webp", mimeType: "image/webp" }],
    });

    expect(createStoredFileMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      projectId: "project_123",
      createdByUserId: null,
      role: "output",
      sourceKind: "chat_upload",
      sourceInteractionId: "interaction_123",
      filename: "banner-fr.webp",
      contentType: "image/webp",
      content: imageData,
      metadata: {
        uploadSurface: "agent_post",
        chatPostFile: true,
      },
    });
    expect(addMessage).toHaveBeenCalledWith({
      attachments: [
        {
          id: "file_123",
          filename: "banner-fr.webp",
          contentType: "image/webp",
          url: "https://files.example/banner-fr.webp?download=1",
        },
      ],
      interactionId: "interaction_123",
      senderType: "agent",
      text: "Here is the localized image",
    });
  });

  it("posts without persisting when tracking is enabled", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await postThreadMessageWithoutTracking(thread, { markdown: "Processing ack" });

    expect(addMessage).not.toHaveBeenCalled();
  });

  it("updates the tracked interaction without double wrapping", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    wrapThreadPostForInteraction(thread, "interaction_456", addMessage);
    await thread.post("Agent reply");

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_456",
      senderType: "agent",
      text: "Agent reply",
    });
  });
});
