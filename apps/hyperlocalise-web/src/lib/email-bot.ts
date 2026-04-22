import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { eq, sql } from "drizzle-orm";
import { Chat } from "chat";
import type { Message, Thread } from "chat";
import { Resend } from "resend";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { regenerateImageFromAttachment } from "@/lib/image-generation";
import { createResendAdapter } from "@/lib/resend/adapter";
import type { EmailTranslationQueue } from "@/lib/workflow/types";
import { createEmailTranslationQueue } from "@/workflows/adapters";

type EmailBotState = {
  lastEmailEvent?: {
    senderEmail: string;
    subject: string;
    originalMessageId: string;
  };
};

let botInstance: Chat<{ resend: ReturnType<typeof createResendAdapter> }, EmailBotState> | null =
  null;
let botQueue: EmailTranslationQueue | null = null;

function createStateAdapter() {
  return env.REDIS_URL ? createRedisState({ url: env.REDIS_URL }) : createMemoryState();
}

function parseLocales(text: string): { sourceLocale: string | null; targetLocale: string | null } {
  const patterns = [
    /(?:source|from|src)\s*[:-]?\s*([a-z]{2}(?:-[A-Z]{2})?)/i,
    /(?:target|to|dst)\s*[:-]?\s*([a-z]{2}(?:-[A-Z]{2})?)/i,
    /translate\s+(?:from\s+)?([a-z]{2}(?:-[A-Z]{2})?)\s+(?:to|into)\s+([a-z]{2}(?:-[A-Z]{2})?)/i,
    /([a-z]{2}(?:-[A-Z]{2})?)\s*(?:→|->|to)\s*([a-z]{2}(?:-[A-Z]{2})?)/i,
  ];

  let sourceLocale: string | null = null;
  let targetLocale: string | null = null;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        sourceLocale = match[1]!.toLowerCase();
        targetLocale = match[2]!.toLowerCase();
        break;
      } else if (match[1] && !sourceLocale) {
        sourceLocale = match[1]!.toLowerCase();
      } else if (match[1] && sourceLocale && !targetLocale) {
        targetLocale = match[1]!.toLowerCase();
      }
    }
  }

  return { sourceLocale, targetLocale };
}

async function lookupUserByEmail(email: string) {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()))
    .limit(1);

  return user ?? null;
}

async function fetchAttachmentDownloadUrls(
  emailId: string,
  attachments: Array<{ id: string; filename: string | null; contentType: string }>,
): Promise<Array<{ id: string; filename: string; downloadUrl: string; contentType: string }>> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const results: Array<{ id: string; filename: string; downloadUrl: string; contentType: string }> =
    [];

  for (const att of attachments) {
    const result = await resend.emails.receiving.attachments.get({
      emailId,
      id: att.id,
    });

    if (result.error || !result.data) {
      throw new Error(
        `Failed to fetch attachment ${att.id}: ${result.error?.message ?? "unknown"}`,
      );
    }

    results.push({
      id: att.id,
      filename: att.filename ?? "attachment",
      downloadUrl: result.data.download_url,
      contentType: att.contentType,
    });
  }

  return results;
}

async function handleEmail(thread: Thread<EmailBotState>, message: Message) {
  const queue = botQueue;
  if (!queue) {
    return;
  }

  const senderEmail = message.author.userId;
  const user = await lookupUserByEmail(senderEmail);

  if (!user) {
    await thread.post(
      "Hi! You don't appear to be a registered Hyperlocalise user. Please sign up at https://hyperlocalise.com to use email translation.",
    );
    return;
  }

  const raw = message.raw as {
    emailId?: string;
    subject?: string;
    messageId?: string;
    attachments?: Array<{ id: string; filename: string | null; contentType: string }>;
  };

  const attachments = raw.attachments ?? [];
  if (attachments.length === 0) {
    await thread.post(
      "Hi! Send me an email with a file attachment and I'll translate it for you. Include the source and target locales in the subject or body (e.g., 'from en to fr').",
    );
    return;
  }

  if (!raw.emailId || !raw.messageId) {
    await thread.post("Sorry, I couldn't process this email. Missing email metadata.");
    return;
  }

  const imageAttachments = message.attachments.filter((att) => att.type === "image");
  if (imageAttachments.length > 0) {
    await handleImageAttachment(thread, message, imageAttachments[0]!, raw);
    return;
  }

  const { sourceLocale, targetLocale } = parseLocales(`${raw.subject ?? ""}\n${message.text}`);

  if (!sourceLocale || !targetLocale) {
    await thread.post(
      "Please specify the source and target locales. You can write something like 'from en to fr' in the subject or body.",
    );
    return;
  }

  await thread.post(
    `Got it! Translating your file from ${sourceLocale} to ${targetLocale}. I'll email you back when it's ready.`,
  );

  const attachmentUrls = await fetchAttachmentDownloadUrls(raw.emailId, attachments);
  const firstAttachment = attachmentUrls[0];
  if (!firstAttachment) {
    await thread.post("Sorry, I couldn't retrieve your attachment.");
    return;
  }

  await thread.setState({
    lastEmailEvent: {
      senderEmail,
      subject: raw.subject ?? "",
      originalMessageId: raw.messageId,
    },
  });

  await queue.enqueue({
    senderEmail,
    subject: raw.subject ?? "",
    originalMessageId: raw.messageId,
    attachmentDownloadUrl: firstAttachment.downloadUrl,
    attachmentFilename: firstAttachment.filename,
    sourceLocale,
    targetLocale,
  });
}

async function handleImageAttachment(
  thread: Thread<EmailBotState>,
  message: Message,
  imageAttachment: Message["attachments"][number],
  raw: {
    emailId?: string;
    subject?: string;
    messageId?: string;
  },
) {
  if (!imageAttachment.fetchData) {
    await thread.post("Sorry, I couldn't retrieve your image attachment.");
    return;
  }

  await thread.post("Got your image! Analyzing and generating a new version for you...");

  try {
    const imageBuffer = await imageAttachment.fetchData();
    const mimeType = imageAttachment.mimeType ?? "image/png";
    const userText = `${raw.subject ?? ""}\n${message.text}`.trim();

    const result = await regenerateImageFromAttachment(imageBuffer, mimeType, userText);

    const outputFilename = `generated-${Date.now()}.png`;

    await thread.post({
      raw: `Here's your generated image based on the prompt:\n\n${result.prompt}`,
      files: [
        {
          data: result.image,
          filename: outputFilename,
          mimeType: "image/png",
        },
      ],
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Image generation failed";
    await thread.post(`Sorry, I couldn't generate the image: ${messageText}`);
  }
}

export async function getEmailBot(options?: { emailTranslationQueue?: EmailTranslationQueue }) {
  if (botInstance) {
    return botInstance;
  }

  botQueue = options?.emailTranslationQueue ?? createEmailTranslationQueue();

  if (!env.RESEND_API_KEY || !env.RESEND_WEBHOOK_SECRET || !env.RESEND_FROM_ADDRESS) {
    throw new Error("missing Resend email bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      resend: createResendAdapter({
        apiKey: env.RESEND_API_KEY,
        webhookSecret: env.RESEND_WEBHOOK_SECRET,
        fromAddress: env.RESEND_FROM_ADDRESS,
        fromName: env.RESEND_FROM_NAME ?? "Hyperlocalise",
        userName: "hyperlocalise",
      }),
    },
    logger: "info",
    state: createStateAdapter(),
    userName: "hyperlocalise",
  });

  botInstance.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await handleEmail(thread, message);
  });

  botInstance.onSubscribedMessage(async (thread, message) => {
    await handleEmail(thread, message);
  });

  return botInstance;
}
