import { describe, expect, it, vi } from "vite-plus/test";
import type { Message, Thread } from "chat";

import { regenerateImageFromAttachment } from "@/lib/image-generation";

import { handleImageAttachment } from "./image-attachments";
import type { EmailRequestIntent } from "./intent";
import type { EmailBotState, RawEmailMessage } from "./types";

vi.mock("@/lib/image-generation", () => ({
  regenerateImageFromAttachment: vi.fn(),
}));

function createThread() {
  const posts: unknown[] = [];
  const thread = {
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return {};
    }),
  } as unknown as Thread<EmailBotState>;

  return { posts, thread };
}

const raw = {
  emailId: "email_123",
  messageId: "message_123",
  subject: "Translate banner",
} satisfies Pick<RawEmailMessage, "emailId" | "messageId" | "subject">;

const intent = {
  kind: "translate",
  sourceLocale: "en",
  targetLocale: "fr",
  instructions: null,
  confidence: 0.95,
  missingFields: [],
} satisfies EmailRequestIntent;

describe("handleImageAttachment", () => {
  it("uses the generated image media type for the posted file", async () => {
    vi.mocked(regenerateImageFromAttachment).mockResolvedValueOnce({
      image: Buffer.from("generated"),
      mimeType: "image/webp",
      prompt: "prompt",
    });
    const { posts, thread } = createThread();
    const message = {
      text: "Translate to French",
    } as Message<EmailBotState>;
    const imageAttachment = {
      type: "image",
      name: "banner.png",
      mimeType: "image/png",
      data: Buffer.from("source"),
    } as Message["attachments"][number];

    await handleImageAttachment(thread, message, imageAttachment, raw, intent);

    expect(posts[0]).toMatchObject({
      files: [
        {
          filename: "banner-fr.webp",
          mimeType: "image/webp",
        },
      ],
    });
  });

  it("falls back to PNG when no source filename or generated media type is available", async () => {
    vi.mocked(regenerateImageFromAttachment).mockResolvedValueOnce({
      image: Buffer.from("generated"),
      mimeType: "",
      prompt: "prompt",
    });
    const { posts, thread } = createThread();
    const message = {
      text: "Translate to French",
    } as Message<EmailBotState>;
    const imageAttachment = {
      type: "image",
      data: Buffer.from("source"),
    } as Message["attachments"][number];

    await handleImageAttachment(thread, message, imageAttachment, raw, {
      ...intent,
      targetLocale: null,
    });

    expect(posts[0]).toMatchObject({
      files: [
        {
          filename: "image-localized.png",
          mimeType: "image/png",
        },
      ],
    });
  });
});
