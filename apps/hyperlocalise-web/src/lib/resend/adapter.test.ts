import { describe, expect, it, vi } from "vite-plus/test";

import { createResendAdapter } from "./adapter";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email_reply" }, error: null })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mocks.send,
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
