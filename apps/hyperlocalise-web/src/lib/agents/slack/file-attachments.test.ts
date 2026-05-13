import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Message } from "chat";

import { createStoredFile } from "@/lib/file-storage/records";

import { storeSlackFileAttachments } from "./file-attachments";

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile: vi.fn(),
}));

describe("storeSlackFileAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the stored Slack file has no retrievable URL", async () => {
    const attachments: NonNullable<Message["attachments"]> = [
      {
        type: "file",
        name: "en-US.json",
        mimeType: "application/json",
        fetchData: vi.fn(async () => Buffer.from('{"hello":"Hello"}')),
      },
    ];
    vi.mocked(createStoredFile).mockResolvedValueOnce({
      id: "file_123",
      filename: "en-US.json",
      contentType: "application/json",
      downloadUrl: null,
      storageUrl: null,
    } as never);

    await expect(
      storeSlackFileAttachments({
        attachments,
        organizationId: "org-123",
        projectId: "project-123",
        createdByUserId: "user-123",
        interactionId: "interaction-123",
      }),
    ).rejects.toThrow("Stored Slack file file_123 has no retrievable URL");
  });
});
