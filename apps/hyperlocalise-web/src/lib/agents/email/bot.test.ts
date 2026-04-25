import { describe, expect, it, vi } from "vite-plus/test";
import type { Message, Thread } from "chat";

import type { EmailBotState, RawEmailMessage } from "./types";
import type { EmailRequestIntent } from "./intent";
import { createEmailHandler, type EmailHandlerDependencies } from "./bot";

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "test-key",
    RESEND_WEBHOOK_SECRET: "test-secret",
    RESEND_FROM_ADDRESS: "agent@example.com",
    RESEND_FROM_NAME: "Hyperlocalise",
  },
}));

vi.mock("@/lib/agents/runtime/state", () => ({
  createChatStateAdapter: vi.fn(),
}));

vi.mock("@/lib/resend/adapter", () => ({
  createResendAdapter: vi.fn(),
}));

vi.mock("@/workflows/adapters", () => ({
  createEmailTranslationQueue: vi.fn(),
}));

function createThread(initialState: EmailBotState = {}) {
  let state: EmailBotState = initialState;
  const posts: unknown[] = [];

  const thread = {
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return {};
    }),
    setState: vi.fn(async (nextState: Partial<EmailBotState>) => {
      state = { ...state, ...nextState };
    }),
    get state() {
      return Promise.resolve(state);
    },
  } as unknown as Thread<EmailBotState>;

  return {
    posts,
    thread,
    getState: () => state,
  };
}

function createMessage(input: {
  text?: string;
  raw?: Partial<RawEmailMessage>;
  attachments?: Message["attachments"];
}) {
  const raw: RawEmailMessage = {
    emailId: "email_123",
    messageId: "message_123",
    subject: "Translate from en to fr",
    to: ["Example Org <example-org@inbox.hyperlocalise.com>"],
    attachments: [
      {
        id: "att_123",
        filename: "homepage.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
    ...input.raw,
  };

  return {
    author: { userId: "sender@example.com" },
    text: input.text ?? "Please translate from en to fr",
    raw,
    attachments:
      input.attachments ??
      raw.attachments?.map((att) => ({
        type: att.contentType.startsWith("image/") ? ("image" as const) : ("file" as const),
        name: att.filename ?? "attachment",
        mimeType: att.contentType,
      })) ??
      [],
  } as unknown as Message;
}

function createDependencies() {
  const dependencies = {
    queue: {
      enqueue: vi.fn(async () => ({ ids: ["run_123"] })),
    },
    lookupUserByEmail: vi.fn(async () => ({
      id: "user_123",
      email: "sender@example.com",
      firstName: "Sender",
      lastName: "Example",
    })),
    resolveInboundEmailOrganization: vi.fn(async () => ({
      id: "org_123",
      inboundEmailAddress: "example-org@inbox.hyperlocalise.com",
    })),
    interpretEmailRequest: vi.fn(
      async (): Promise<EmailRequestIntent> => ({
        sourceLocale: "en",
        targetLocale: "fr",
        instructions: "Keep it formal.",
        confidence: 0.96,
        missingFields: [],
      }),
    ),
    fetchAttachmentDownloadUrls: vi.fn(async () => [
      {
        id: "att_123",
        filename: "homepage.xlsx",
        downloadUrl: "https://example.com/homepage.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ]),
    handleImageAttachment: vi.fn(async (thread: Thread<EmailBotState>) => {
      await thread.post("I received an image, but image localization is not available yet.");
    }),
  } satisfies EmailHandlerDependencies;

  return dependencies;
}

describe("createEmailHandler", () => {
  it("sends an intake receipt and enqueues accepted file translations", async () => {
    const dependencies = createDependencies();
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain("Got it. I am translating:");
    expect(posts[0]).toContain("- homepage.xlsx");
    expect(posts[0]).toContain("Source: en");
    expect(posts[0]).toContain("Target: fr");
    expect(posts[0]).toContain("style instructions are captured");
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.stringMatching(/^eml_[a-f0-9]{16}$/),
        attachmentId: "att_123",
        attachmentFilename: "homepage.xlsx",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );
    expect(getState().processedTranslationKeys).toHaveLength(1);
  });

  it("stores a pending request when source or target locale is missing", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      sourceLocale: null,
      targetLocale: "fr",
      instructions: null,
      confidence: 0.9,
      missingFields: ["sourceLocale"],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({ text: "Translate to French" }));

    expect(posts[0]).toContain("I received your file");
    expect(posts[0]).toContain("source language");
    expect(getState().pendingTranslationRequest).toMatchObject({
      targetLocale: "fr",
      sourceLocale: null,
    });
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("continues a pending request when the user replies with missing locales", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      instructions: null,
      confidence: 0.94,
      missingFields: [],
    });
    const { thread, posts } = createThread({
      pendingTranslationRequest: {
        requestId: "eml_pending",
        senderEmail: "sender@example.com",
        subject: "Translate",
        originalMessageId: "message_original",
        emailId: "email_original",
        inboundEmailAddress: "example-org@inbox.hyperlocalise.com",
        attachments: [{ id: "att_123", filename: "homepage.xlsx", contentType: "text/csv" }],
        sourceLocale: null,
        targetLocale: null,
        instructions: null,
      },
    });
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "source: en-US\ntarget: fr-FR",
        raw: { emailId: "email_reply", messageId: "message_reply", attachments: [] },
        attachments: [],
      }),
    );

    expect(posts[0]).toContain("Got it. I am translating:");
    expect(dependencies.resolveInboundEmailOrganization).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "eml_pending",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
      }),
    );
  });

  it("asks for confirmation when intent confidence is low", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      sourceLocale: "en",
      targetLocale: "fr",
      instructions: null,
      confidence: 0.7,
      missingFields: [],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain('Please reply "yes" to start');
    expect(getState().pendingTranslationRequest).toMatchObject({
      sourceLocale: "en",
      targetLocale: "fr",
    });
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue duplicate attachment requests", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread({
      processedTranslationKeys: ["email_123:att_123:en:fr"],
    });
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain("already accepted this translation request");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("routes image-only emails to the unsupported image message", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        raw: {
          attachments: [{ id: "img_123", filename: "banner.png", contentType: "image/png" }],
        },
        attachments: [{ type: "image", name: "banner.png", mimeType: "image/png" }],
      }),
    );

    expect(posts[0]).toContain("image localization is not available");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });
});
