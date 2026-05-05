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
  createEmailAgentTaskQueue: vi.fn(),
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
        kind: "translate",
        sourceLocale: "en",
        targetLocale: "fr",
        instructions: "Keep it formal.",
        confidence: 0.96,
        missingFields: [],
      }),
    ),
    interpretClarificationReply: vi.fn(
      async (): Promise<EmailRequestIntent> => ({
        kind: "translate",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        instructions: null,
        confidence: 0.94,
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
      await thread.post({
        raw: "Here is the localized version of banner.png for the fr market. I kept the layout and style as close to the original as possible.\n\nLet me know if you'd like any adjustments to the text placement or tone.\n\n—Hyperlocalise Agent",
        files: [{ data: Buffer.from("image"), filename: "banner-fr.png", mimeType: "image/png" }],
      });
    }),
    createTranslationJob: vi.fn(async () => ({ jobId: "job_123" })),
    setTranslationJobWorkflowRun: vi.fn(async () => {}),
    failTranslationJobBeforeRun: vi.fn(async () => {}),
  } satisfies EmailHandlerDependencies;

  return dependencies;
}

describe("createEmailHandler", () => {
  it("sends an intake receipt and enqueues accepted file translations", async () => {
    const dependencies = createDependencies();
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain("Thanks. I've queued");
    expect(posts[0]).toContain("- homepage.xlsx");
    expect(posts[0]).toContain("Source: en");
    expect(posts[0]).toContain("Target: fr");
    expect(posts[0]).toContain("Instructions applied: Keep it formal.");
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "translate",
        jobId: "job_123",
        requestId: expect.stringMatching(/^eml_[a-f0-9]{16}$/),
        inputs: {
          attachments: [
            expect.objectContaining({
              id: "att_123",
              filename: "homepage.xlsx",
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              downloadUrl: "https://example.com/homepage.xlsx",
            }),
          ],
        },
        parameters: {
          translate: {
            sourceLocale: "en",
            targetLocale: "fr",
            instructions: "Keep it formal.",
          },
        },
        replyPolicy: {
          type: "threaded_email",
        },
      }),
    );
    expect(getState().processedEmailAgentTaskKeys).toHaveLength(1);
  });

  it("does not mark or acknowledge tasks as queued when enqueue fails", async () => {
    const dependencies = createDependencies();
    dependencies.queue.enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await expect(handler(thread, createMessage({}))).rejects.toThrow("queue unavailable");

    expect(posts.some((post) => String(post).includes("Thanks. I've queued"))).toBe(false);
    expect(getState().processedEmailAgentTaskKeys).toBeUndefined();
  });

  it("proceeds when only target locale is present (source is optional)", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: null,
      targetLocale: "fr",
      instructions: null,
      confidence: 0.92,
      missingFields: ["sourceLocale"],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({ text: "Translate to French" }));

    expect(posts[0]).toContain("Thanks. I've queued");
    expect(posts[0]).toContain("Source: auto-detect");
    expect(posts[0]).toContain("Target: fr");
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: {
          translate: expect.objectContaining({
            sourceLocale: null,
            targetLocale: "fr",
          }),
        },
      }),
    );
    expect(getState().pendingEmailAgentTask).toBeUndefined();
  });

  it("stores a pending request when target locale is missing", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: null,
      instructions: null,
      confidence: 0.9,
      missingFields: ["targetLocale"],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({ text: "Translate from English" }));

    expect(posts[0]).toContain("Thanks for sending");
    expect(posts[0]).toContain("target language");
    expect(getState().pendingEmailAgentTask).toMatchObject({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: null,
    });
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not ask for source language even when source locale is also missing", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: null,
      targetLocale: null,
      instructions: null,
      confidence: 0.9,
      missingFields: ["sourceLocale", "targetLocale"],
    });
    const { thread, posts } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "Please translate this file",
        raw: {
          subject: "Translate",
          attachments: [{ id: "att_123", filename: "en-US.json", contentType: "application/json" }],
        },
      }),
    );

    expect(posts[0]).toContain(
      "Thanks for sending that file. Before I can start, could you let me know the target language?",
    );
    expect(posts[0]).not.toContain("source language");
    expect(posts[0]).toContain("- en-US.json");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("continues a pending request when the user replies with missing locales", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread({
      pendingEmailAgentTask: {
        kind: "translate",
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
        text: "English to French",
        raw: { emailId: "email_reply", messageId: "message_reply", attachments: [] },
        attachments: [],
      }),
    );

    expect(posts[0]).toContain("Thanks. I've queued");
    expect(dependencies.resolveInboundEmailOrganization).not.toHaveBeenCalled();
    expect(dependencies.interpretClarificationReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: "English to French" }),
    );
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "eml_pending",
        parameters: {
          translate: expect.objectContaining({
            sourceLocale: "en-US",
            targetLocale: "fr-FR",
          }),
        },
      }),
    );
  });

  it("asks for confirmation when intent confidence is low", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
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
    expect(getState().pendingEmailAgentTask).toMatchObject({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: "fr",
    });
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue duplicate attachment requests", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread({
      processedEmailAgentTaskKeys: ["translate:email_123:att_123:en:fr:keep it formal."],
    });
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain("I already accepted this translation request");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not treat the same file with different instructions as a duplicate", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread({
      processedEmailAgentTaskKeys: ["translate:email_123:att_123:en:fr:keep it casual."],
    });
    const handler = createEmailHandler(dependencies);

    await handler(thread, createMessage({}));

    expect(posts[0]).toContain("Thanks. I've queued");
    expect(dependencies.queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("shows translation help for no-attachment translation requests", async () => {
    const dependencies = createDependencies();
    const { thread, posts } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "Please translate from en to fr",
        raw: { attachments: [] },
        attachments: [],
      }),
    );

    expect(posts[0]).toContain("send one or more supported files");
    expect(posts[0]).toContain("Translate from en-US to fr-FR");
    expect(dependencies.interpretEmailRequest).toHaveBeenCalledWith({
      subject: "Translate from en to fr",
      text: "Please translate from en to fr",
    });
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("politely rejects future text-only capabilities that are not available yet", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "keyword_research",
      sourceLocale: null,
      targetLocale: "fr",
      instructions: "Find keywords for our pricing page.",
      confidence: 0.94,
      missingFields: [],
    });
    const { thread, posts } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "Can you do localized keyword research for France?",
        raw: { attachments: [] },
        attachments: [],
      }),
    );

    expect(posts[0]).toContain("I can't handle localized keyword research by email yet.");
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("routes image-only emails through image localization", async () => {
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

    expect(posts[0]).toMatchObject({
      raw: expect.stringContaining("Here is the localized version"),
      files: [expect.objectContaining({ filename: "banner-fr.png" })],
    });
    expect(dependencies.handleImageAttachment).toHaveBeenCalledWith(
      thread,
      expect.anything(),
      expect.objectContaining({ type: "image", name: "banner.png" }),
      expect.objectContaining({ emailId: "email_123" }),
      expect.objectContaining({ targetLocale: "fr" }),
    );
    expect(dependencies.interpretEmailRequest).toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("asks for a target language before localizing image-only emails", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: null,
      targetLocale: null,
      instructions: null,
      confidence: 0.9,
      missingFields: ["targetLocale"],
    });
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

    expect(posts[0]).toContain("target language");
    expect(dependencies.handleImageAttachment).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("asks once for a target language when mixed image and file emails are missing it", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: null,
      targetLocale: null,
      instructions: null,
      confidence: 0.9,
      missingFields: ["targetLocale"],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        raw: {
          attachments: [
            { id: "img_123", filename: "banner.png", contentType: "image/png" },
            { id: "file_123", filename: "copy.csv", contentType: "text/csv" },
          ],
        },
        attachments: [
          { type: "image", name: "banner.png", mimeType: "image/png" },
          { type: "file", name: "copy.csv", mimeType: "text/csv" },
        ],
      }),
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("target language");
    expect(posts[0]).toContain("- banner.png");
    expect(posts[0]).toContain("- copy.csv");
    expect(getState().pendingEmailAgentTask).toMatchObject({
      kind: "translate",
      attachments: [{ id: "file_123", filename: "copy.csv" }],
      imageAttachments: [expect.objectContaining({ name: "banner.png" })],
      targetLocale: null,
    });
    expect(dependencies.handleImageAttachment).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("keeps mixed email files pending when image localization confidence is low", async () => {
    const dependencies = createDependencies();
    dependencies.interpretEmailRequest.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: "fr",
      instructions: null,
      confidence: 0.7,
      missingFields: [],
    });
    const { thread, posts, getState } = createThread();
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        raw: {
          attachments: [
            { id: "img_123", filename: "banner.png", contentType: "image/png" },
            { id: "file_123", filename: "copy.csv", contentType: "text/csv" },
          ],
        },
        attachments: [
          { type: "image", name: "banner.png", mimeType: "image/png" },
          { type: "file", name: "copy.csv", mimeType: "text/csv" },
        ],
      }),
    );

    expect(posts[0]).toContain('Please reply "yes" to start');
    expect(posts[0]).toContain("- banner.png");
    expect(posts[0]).toContain("- copy.csv");
    expect(getState().pendingEmailAgentTask).toMatchObject({
      kind: "translate",
      attachments: [{ id: "file_123", filename: "copy.csv" }],
      imageAttachments: [expect.objectContaining({ name: "banner.png" })],
      sourceLocale: "en",
      targetLocale: "fr",
    });
    expect(dependencies.handleImageAttachment).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("merges new file attachments into pending clarification instead of starting a new request", async () => {
    const dependencies = createDependencies();
    dependencies.interpretClarificationReply.mockResolvedValueOnce({
      kind: "translate",
      sourceLocale: "en-US",
      targetLocale: "fr",
      instructions: null,
      confidence: 0.96,
      missingFields: [],
    });
    const { thread, posts, getState } = createThread({
      pendingEmailAgentTask: {
        kind: "translate",
        requestId: "eml_pending",
        senderEmail: "sender@example.com",
        subject: "Translate",
        originalMessageId: "message_original",
        emailId: "email_original",
        inboundEmailAddress: "example-org@inbox.hyperlocalise.com",
        attachments: [{ id: "att_old", filename: "old.xlsx", contentType: "text/csv" }],
        sourceLocale: null,
        targetLocale: "fr",
        instructions: null,
      },
    });
    dependencies.fetchAttachmentDownloadUrls.mockResolvedValueOnce([
      {
        id: "att_old",
        filename: "old.xlsx",
        downloadUrl: "https://example.com/old.xlsx",
        contentType: "text/csv",
      },
      {
        id: "att_new",
        filename: "new.xlsx",
        downloadUrl: "https://example.com/new.xlsx",
        contentType: "text/csv",
      },
    ]);
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "source: en-US",
        raw: {
          emailId: "email_reply",
          messageId: "message_reply",
          attachments: [{ id: "att_new", filename: "new.xlsx", contentType: "text/csv" }],
        },
        attachments: [{ type: "file", name: "new.xlsx", mimeType: "text/csv" }],
      }),
    );

    expect(posts[0]).toContain("Thanks. I've queued");
    expect(posts[0]).toContain("old.xlsx");
    expect(posts[0]).toContain("new.xlsx");
    expect(getState().pendingEmailAgentTask).toBeUndefined();
    expect(dependencies.queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it("processes pending mixed images and files after confirmation", async () => {
    const dependencies = createDependencies();
    const imageMessage = createMessage({
      raw: {
        attachments: [
          { id: "img_123", filename: "banner.png", contentType: "image/png" },
          { id: "file_123", filename: "copy.csv", contentType: "text/csv" },
        ],
      },
      attachments: [
        { type: "image", name: "banner.png", mimeType: "image/png" },
        { type: "file", name: "copy.csv", mimeType: "text/csv" },
      ],
    });
    const { thread, posts, getState } = createThread({
      pendingEmailAgentTask: {
        kind: "translate",
        requestId: "eml_pending",
        senderEmail: "sender@example.com",
        subject: "Translate",
        originalMessageId: "message_original",
        emailId: "email_original",
        inboundEmailAddress: "example-org@inbox.hyperlocalise.com",
        attachments: [{ id: "file_123", filename: "copy.csv", contentType: "text/csv" }],
        imageAttachments: [{ type: "image", name: "banner.png", mimeType: "image/png" }],
        imageMessage,
        imageRaw: {
          emailId: "email_original",
          messageId: "message_original",
          subject: "Translate",
        },
        sourceLocale: "en",
        targetLocale: "fr",
        instructions: null,
      },
    });
    dependencies.fetchAttachmentDownloadUrls.mockResolvedValueOnce([
      {
        id: "file_123",
        filename: "copy.csv",
        downloadUrl: "https://example.com/copy.csv",
        contentType: "text/csv",
      },
    ]);
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "yes",
        raw: { emailId: "email_reply", messageId: "message_reply", attachments: [] },
        attachments: [],
      }),
    );

    expect(dependencies.handleImageAttachment).toHaveBeenCalledWith(
      thread,
      imageMessage,
      expect.objectContaining({ type: "image", name: "banner.png" }),
      expect.objectContaining({ emailId: "email_original" }),
      expect.objectContaining({ targetLocale: "fr" }),
    );
    expect(dependencies.queue.enqueue).toHaveBeenCalledTimes(1);
    expect(getState().pendingEmailAgentTask).toBeUndefined();
    expect(posts.some((post) => String(post).includes("Thanks. I've queued"))).toBe(true);
  });

  it("warns instead of silently dropping pending images when source message data is missing", async () => {
    const dependencies = createDependencies();
    const { thread, posts, getState } = createThread({
      pendingEmailAgentTask: {
        kind: "translate",
        requestId: "eml_pending",
        senderEmail: "sender@example.com",
        subject: "Translate",
        originalMessageId: "message_original",
        emailId: "email_original",
        inboundEmailAddress: "example-org@inbox.hyperlocalise.com",
        attachments: [{ id: "file_123", filename: "copy.csv", contentType: "text/csv" }],
        imageAttachments: [{ type: "image", name: "banner.png", mimeType: "image/png" }],
        imageRaw: {
          emailId: "email_original",
          messageId: "message_original",
          subject: "Translate",
        },
        sourceLocale: "en",
        targetLocale: "fr",
        instructions: null,
      },
    });
    dependencies.fetchAttachmentDownloadUrls.mockResolvedValueOnce([
      {
        id: "file_123",
        filename: "copy.csv",
        downloadUrl: "https://example.com/copy.csv",
        contentType: "text/csv",
      },
    ]);
    const handler = createEmailHandler(dependencies);

    await handler(
      thread,
      createMessage({
        text: "yes",
        raw: { emailId: "email_reply", messageId: "message_reply", attachments: [] },
        attachments: [],
      }),
    );

    expect(posts[0]).toContain("couldn't recover the image attachment");
    expect(posts.some((post) => String(post).includes("- banner.png"))).toBe(false);
    expect(dependencies.handleImageAttachment).not.toHaveBeenCalled();
    expect(dependencies.queue.enqueue).toHaveBeenCalledTimes(1);
    expect(getState().pendingEmailAgentTask).toBeUndefined();
  });
});
