import { describe, expect, it, vi } from "vite-plus/test";

import { fetchAttachmentDownloadUrls } from "./attachments";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        receiving: {
          attachments: {
            get: mocks.get,
            list: mocks.list,
          },
        },
      },
    };
  }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "test-key",
  },
}));

describe("fetchAttachmentDownloadUrls", () => {
  it("falls back to listing signed attachments when the stored attachment id is stale", async () => {
    mocks.get.mockResolvedValueOnce({
      data: null,
      error: { message: "Attachment not found" },
    });
    mocks.list.mockResolvedValueOnce({
      data: {
        object: "list",
        has_more: false,
        data: [
          {
            id: "signed_attachment_id",
            filename: "en-US.json",
            size: 123,
            content_type: "application/json",
            content_disposition: "attachment",
            download_url: "https://example.com/download/en-US.json",
            expires_at: "2026-04-26T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    await expect(
      fetchAttachmentDownloadUrls("email_123", [
        { id: "raw_db_attachment_id", filename: "en-US.json", contentType: "application/json" },
      ]),
    ).resolves.toEqual([
      {
        id: "signed_attachment_id",
        filename: "en-US.json",
        downloadUrl: "https://example.com/download/en-US.json",
        contentType: "application/json",
      },
    ]);
    expect(mocks.get).toHaveBeenCalledWith({
      emailId: "email_123",
      id: "raw_db_attachment_id",
    });
    expect(mocks.list).toHaveBeenCalledWith({ emailId: "email_123" });
  });
});
