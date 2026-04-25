import { describe, expect, it, vi } from "vite-plus/test";

import { createResendAdapter } from "./adapter";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email_reply" }, error: null })),
  getReceivedEmail: vi.fn(),
  getReceivingAttachment: vi.fn(),
  listReceivingAttachments: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mocks.send,
        receiving: {
          get: mocks.getReceivedEmail,
          attachments: {
            get: mocks.getReceivingAttachment,
            list: mocks.listReceivingAttachments,
          },
        },
      },
    };
  }),
}));

describe("createResendAdapter", () => {
  it("sets Reply-To from inbound thread metadata when posting a reply", async () => {
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "test-secret",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });
    const threadId = adapter.encodeThreadId({
      senderEmail: "sender@example.com",
      threadHash: "thread_123",
    });
    const metadataKey = `resend:thread:${threadId}:metadata`;
    const state = {
      get: vi.fn(async (key: string) =>
        key === metadataKey
          ? {
              subject: "Translate",
              messageId: "message_123",
              replyToAddress: "example-org@inbox.hyperlocalise.com",
            }
          : null,
      ),
    };

    await adapter.initialize({ getState: () => state } as never);
    await adapter.postMessage(threadId, "Got it.");

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Hyperlocalise <agent@example.com>",
        to: "sender@example.com",
        replyTo: "example-org@inbox.hyperlocalise.com",
        subject: "Re: Translate",
      }),
    );
  });

  it("stores the org inbound address as Reply-To from received email recipients", async () => {
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });
    const state = {
      get: vi.fn(async () => null),
      set: vi.fn(async (_key: string, _metadata: unknown, _ttl: number) => undefined),
    };

    await adapter.initialize({
      getState: () => state,
      processMessage: vi.fn(),
    } as never);
    await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          type: "email.received",
          data: {
            email_id: "email_123",
            from: "Sender <sender@example.com>",
            to: [
              "Support <support@example.com>",
              "Example Org <example-org@inbox.hyperlocalise.com>",
            ],
            subject: "Translate",
            text: "Translate from en to fr",
            message_id: "message_123",
            attachments: [],
          },
        }),
      }),
    );

    expect(state.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        replyToAddress: "example-org@inbox.hyperlocalise.com",
      }),
      expect.any(Number),
    );
  });

  it("passes webhook waitUntil options into Chat SDK message processing", async () => {
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });
    const state = {
      get: vi.fn(async () => null),
      set: vi.fn(async (_key: string, _metadata: unknown, _ttl: number) => undefined),
    };
    const processMessage = vi.fn();
    const options = { waitUntil: vi.fn() };

    await adapter.initialize({
      getState: () => state,
      processMessage,
    } as never);
    await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          type: "email.received",
          data: {
            email_id: "email_123",
            from: "Sender <sender@example.com>",
            to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
            subject: "Translate",
            text: "Translate from en to fr",
            message_id: "message_123",
            attachments: [],
          },
        }),
      }),
      options,
    );

    expect(processMessage).toHaveBeenCalledWith(
      adapter,
      expect.any(String),
      expect.objectContaining({ id: "email_123" }),
      options,
    );
  });

  it("fetches received email content before processing body-less webhooks", async () => {
    mocks.getReceivedEmail.mockResolvedValueOnce({
      data: {
        object: "email",
        id: "email_123",
        from: "Sender <sender@example.com>",
        to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
        created_at: "2026-04-26T00:00:00.000Z",
        subject: "Translate",
        bcc: null,
        cc: null,
        reply_to: null,
        html: null,
        text: "Can you translate this file from English into Vietnamese",
        headers: null,
        message_id: "message_123",
        raw: null,
        attachments: [
          {
            id: "raw_db_attachment_id",
            filename: "en-US.json",
            size: 123,
            content_type: "application/json",
            content_id: null,
            content_disposition: "attachment",
          },
        ],
      },
      error: null,
    });
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });
    const state = {
      get: vi.fn(async () => null),
      set: vi.fn(async (_key: string, _metadata: unknown, _ttl: number) => undefined),
    };
    const processMessage = vi.fn();

    await adapter.initialize({
      getState: () => state,
      processMessage,
    } as never);
    await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          type: "email.received",
          data: {
            email_id: "email_123",
            from: "Sender <sender@example.com>",
            to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
            subject: "Translate",
            message_id: "message_123",
            attachments: [
              {
                id: "att_123",
                filename: "en-US.json",
                content_type: "application/json",
              },
            ],
          },
        }),
      }),
    );

    expect(mocks.getReceivedEmail).toHaveBeenCalledWith("email_123");
    expect(processMessage).toHaveBeenCalledWith(
      adapter,
      expect.any(String),
      expect.objectContaining({
        text: "Can you translate this file from English into Vietnamese",
        raw: expect.objectContaining({
          text: "Can you translate this file from English into Vietnamese",
          attachments: [
            expect.objectContaining({
              id: "att_123",
              filename: "en-US.json",
              contentType: "application/json",
            }),
          ],
        }),
      }),
      undefined,
    );
  });

  it("falls back to listed signed attachments when fetching attachment data", async () => {
    mocks.getReceivedEmail.mockResolvedValueOnce({
      data: {
        object: "email",
        id: "email_123",
        from: "Sender <sender@example.com>",
        to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
        created_at: "2026-04-26T00:00:00.000Z",
        subject: "Translate image",
        bcc: null,
        cc: null,
        reply_to: null,
        html: null,
        text: "Translate this image to Vietnamese",
        headers: null,
        message_id: "message_123",
        raw: null,
        attachments: [
          {
            id: "raw_db_attachment_id",
            filename: "banner.png",
            size: 123,
            content_type: "image/png",
            content_id: null,
            content_disposition: "attachment",
          },
        ],
      },
      error: null,
    });
    mocks.getReceivingAttachment.mockResolvedValueOnce({
      data: null,
      error: { message: "Attachment not found" },
    });
    mocks.listReceivingAttachments.mockResolvedValueOnce({
      data: {
        object: "list",
        has_more: false,
        data: [
          {
            id: "signed_attachment_id",
            filename: "banner.png",
            size: 123,
            content_type: "image/png",
            content_disposition: "attachment",
            download_url: "https://example.com/banner.png",
            expires_at: "2026-04-26T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("image-bytes"));
    const processMessage = vi.fn();
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });

    await adapter.initialize({
      getState: () => ({
        get: vi.fn(async () => null),
        set: vi.fn(async (_key: string, _metadata: unknown, _ttl: number) => undefined),
      }),
      processMessage,
    } as never);
    await adapter.handleWebhook(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          type: "email.received",
          data: {
            email_id: "email_123",
            from: "Sender <sender@example.com>",
            to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
            subject: "Translate image",
            message_id: "message_123",
            attachments: [],
          },
        }),
      }),
    );

    const message = processMessage.mock.calls[0]?.[2];
    const data = await message.attachments[0].fetchData();

    expect(data).toEqual(Buffer.from("image-bytes"));
    expect(mocks.getReceivingAttachment).toHaveBeenCalledWith({
      emailId: "email_123",
      id: "raw_db_attachment_id",
    });
    expect(mocks.listReceivingAttachments).toHaveBeenCalledWith({ emailId: "email_123" });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/banner.png");

    fetchMock.mockRestore();
  });

  it("isolates thread metadata by org inbound address for the same sender and subject", async () => {
    const adapter = createResendAdapter({
      apiKey: "test-key",
      webhookSecret: "",
      fromAddress: "agent@example.com",
      fromName: "Hyperlocalise",
    });
    const state = {
      get: vi.fn(async () => null),
      set: vi.fn(async (_key: string, _metadata: unknown, _ttl: number) => undefined),
    };

    await adapter.initialize({
      getState: () => state,
      processMessage: vi.fn(),
    } as never);

    for (const [emailId, inboundAddress] of [
      ["email_123", "example-org@inbox.hyperlocalise.com"],
      ["email_456", "other-org@inbox.hyperlocalise.com"],
    ] as const) {
      await adapter.handleWebhook(
        new Request("https://example.com/webhook", {
          method: "POST",
          body: JSON.stringify({
            type: "email.received",
            data: {
              email_id: emailId,
              from: "Sender <sender@example.com>",
              to: [`Org <${inboundAddress}>`],
              subject: "Translate",
              text: "Translate from en to fr",
              message_id: `message_${emailId}`,
              attachments: [],
            },
          }),
        }),
      );
    }

    expect(state.set).toHaveBeenCalledTimes(2);
    expect(state.set.mock.calls[0]?.[0]).not.toBe(state.set.mock.calls[1]?.[0]);
    expect(state.set.mock.calls[0]?.[1]).toMatchObject({
      replyToAddress: "example-org@inbox.hyperlocalise.com",
    });
    expect(state.set.mock.calls[1]?.[1]).toMatchObject({
      replyToAddress: "other-org@inbox.hyperlocalise.com",
    });
  });
});
