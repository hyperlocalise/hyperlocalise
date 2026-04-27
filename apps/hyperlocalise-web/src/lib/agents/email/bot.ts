import { createHash } from "node:crypto";
import { Chat } from "chat";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import { createChatLogger, createLogger } from "@/lib/log";
import { createResendAdapter } from "@/lib/resend/adapter";
import type { EmailTranslationEventData, EmailTranslationQueue } from "@/lib/workflow/types";
import { createEmailTranslationQueue } from "@/workflows/adapters";

import { fetchAttachmentDownloadUrls } from "./attachments";
import { handleImageAttachment } from "./image-attachments";
import {
  type EmailRequestIntent,
  interpretClarificationReply,
  interpretEmailRequest,
} from "./intent";
import { resolveInboundEmailOrganization } from "./organizations";
import type { EmailBotState, PendingEmailTranslationRequest, RawEmailMessage } from "./types";
import { lookupUserByEmail } from "./users";

export { interpretClarificationReply };

let botInstance: Chat<{ resend: ReturnType<typeof createResendAdapter> }, EmailBotState> | null =
  null;
let botQueue: EmailTranslationQueue | null = null;

const logger = createLogger("email-bot");

export type EmailHandlerDependencies = {
  queue: EmailTranslationQueue;
  lookupUserByEmail: typeof lookupUserByEmail;
  resolveInboundEmailOrganization: typeof resolveInboundEmailOrganization;
  interpretEmailRequest: typeof interpretEmailRequest;
  interpretClarificationReply: typeof interpretClarificationReply;
  fetchAttachmentDownloadUrls: typeof fetchAttachmentDownloadUrls;
  handleImageAttachment: typeof handleImageAttachment;
};

const intentConfirmationThreshold = 0.85;
const maxProcessedKeys = 100;

function createRequestId(input: string) {
  return `eml_${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

function createTranslationKey(input: {
  emailId: string;
  attachmentId: string;
  sourceLocale: string | null;
  targetLocale: string;
}) {
  return [
    input.emailId,
    input.attachmentId,
    (input.sourceLocale ?? "auto").toLowerCase(),
    input.targetLocale.toLowerCase(),
  ].join(":");
}

function attachmentName(att: { filename: string | null; id: string }) {
  return att.filename ?? `attachment-${att.id}`;
}

function formatFileList(attachments: Array<{ filename: string | null; id: string }>) {
  return attachments.map((att) => `- ${attachmentName(att)}`).join("\n");
}

function isAffirmative(text: string) {
  return /^(yes|y|confirm|confirmed|correct|go ahead|start|proceed|ok|okay)\.?$/i.test(text.trim());
}

function buildSupportedRequestHelp() {
  return [
    "I'm here to help with translations. Just send one or more supported files and let me know the languages in the subject or body.",
    "",
    "Examples:",
    "- Translate from en-US to fr-FR",
    "- Source: English, target: Japanese",
    "- en to pt-BR, keep the tone casual",
    "",
    "Supported files include documents, spreadsheets, JSON, or text files.",
    "",
    "—Hyperlocalise Agent",
  ].join("\n");
}

function buildClarificationMessage(pending: PendingEmailTranslationRequest) {
  const missing = [pending.targetLocale ? null : "target language"].filter(Boolean);

  return [
    `Thanks for sending ${pending.attachments.length === 1 ? "that file" : "those files"}. Before I can start, could you let me know the ${missing.join(" and ")}?`,
    "",
    "Files:",
    formatFileList(pending.attachments),
    "",
    "Just reply with something like:",
    "- Target: Vietnamese",
    "- English to Vietnamese",
    "- source: en-US, target: vi-VN",
    "",
    "—Hyperlocalise Agent",
    `Request ID: ${pending.requestId}`,
  ].join("\n");
}

function buildConfirmationMessage(pending: PendingEmailTranslationRequest) {
  return [
    'I think I understood your request. Please reply "yes" to start, or send corrected locales if anything looks off.',
    "",
    "Files:",
    formatFileList(pending.attachments),
    "",
    pending.sourceLocale ? `Source: ${pending.sourceLocale}` : "Source: auto-detect",
    `Target: ${pending.targetLocale}`,
    pending.instructions ? `Instructions: ${pending.instructions}` : null,
    pending.instructions
      ? "Note: I captured your style instructions, but email-based translations don't apply them automatically yet. Running the same file through the dashboard will respect those settings."
      : null,
    "",
    "—Hyperlocalise Agent",
    `Request ID: ${pending.requestId}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function buildIntakeReceipt(input: {
  pending: PendingEmailTranslationRequest;
  skippedDuplicateCount: number;
}) {
  const lines = [
    `Thanks. I've queued ${input.pending.attachments.length === 1 ? "the file" : "the files"} for translation into ${input.pending.targetLocale}. You should receive the finished ${input.pending.attachments.length === 1 ? "file" : "files"} in this thread shortly — usually within a minute or two.`,
    "",
    "Files:",
    formatFileList(input.pending.attachments),
    "",
    input.pending.sourceLocale ? `Source: ${input.pending.sourceLocale}` : "Source: auto-detect",
    `Target: ${input.pending.targetLocale}`,
    input.pending.instructions ? `Instructions: ${input.pending.instructions}` : null,
    input.pending.instructions
      ? "Note: I captured your style instructions, but email-based translations don't apply them automatically yet. Running the same file through the dashboard will respect those settings."
      : null,
    input.skippedDuplicateCount > 0
      ? `I skipped ${input.skippedDuplicateCount} duplicate file request${input.skippedDuplicateCount === 1 ? "" : "s"} that were already in progress.`
      : null,
    "",
    "—Hyperlocalise Agent",
    `Request ID: ${input.pending.requestId}`,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

async function enqueuePendingTranslation(input: {
  thread: Thread<EmailBotState>;
  queue: EmailTranslationQueue;
  fetchAttachmentDownloadUrls: typeof fetchAttachmentDownloadUrls;
  pending: PendingEmailTranslationRequest;
}) {
  const { thread, queue, fetchAttachmentDownloadUrls, pending } = input;
  const log = logger.child({ req: pending.requestId });
  log.info(
    {
      attachmentCount: pending.attachments.length,
      sourceLocale: pending.sourceLocale,
      targetLocale: pending.targetLocale,
    },
    "enqueueing pending translation",
  );

  if (!pending.targetLocale) {
    log.info("missing target locale, requesting clarification");
    await thread.post(buildClarificationMessage(pending));
    await thread.setState({ pendingTranslationRequest: pending });
    return;
  }

  const attachmentUrls = await fetchAttachmentDownloadUrls(pending.emailId, pending.attachments);
  if (attachmentUrls.length === 0) {
    log.error("failed to retrieve attachment URLs");
    await thread.post(
      [
        `Sorry — I couldn't retrieve the attachments for this request. This sometimes happens when the file is too large or the download link expired.`,
        "",
        "Could you resend the file and try again?",
        "",
        "—Hyperlocalise Agent",
        `Request ID: ${pending.requestId}`,
      ].join("\n"),
    );
    return;
  }

  const state = await thread.state;
  const processedKeys = new Set(state?.processedTranslationKeys ?? []);
  const nextProcessedKeys = [...processedKeys];
  const events: EmailTranslationEventData[] = [];
  let skippedDuplicateCount = 0;

  for (const att of attachmentUrls) {
    const key = createTranslationKey({
      emailId: pending.emailId,
      attachmentId: att.id,
      sourceLocale: pending.sourceLocale,
      targetLocale: pending.targetLocale,
    });

    if (processedKeys.has(key)) {
      log.info({ key }, "skipping duplicate translation");
      skippedDuplicateCount += 1;
      continue;
    }

    processedKeys.add(key);
    nextProcessedKeys.push(key);
    events.push({
      requestId: pending.requestId,
      attachmentId: att.id,
      senderEmail: pending.senderEmail,
      subject: pending.subject,
      originalMessageId: pending.originalMessageId,
      inboundEmailAddress: pending.inboundEmailAddress,
      attachmentDownloadUrl: att.downloadUrl,
      attachmentFilename: att.filename,
      sourceLocale: pending.sourceLocale,
      targetLocale: pending.targetLocale,
      instructions: pending.instructions,
    });
  }

  if (events.length === 0) {
    log.info("all attachments were duplicates");
    await thread.post(
      [
        "I already accepted this translation request, so I didn't start it again.",
        "",
        "If you meant to send a different file or change the language, just reply with the new details.",
        "",
        "—Hyperlocalise Agent",
        `Request ID: ${pending.requestId}`,
      ].join("\n"),
    );
    await thread.setState({ pendingTranslationRequest: undefined });
    return;
  }

  await thread.post(buildIntakeReceipt({ pending, skippedDuplicateCount }));
  log.info({ eventCount: events.length, skippedDuplicateCount }, "translations enqueued");

  await thread.setState({
    lastEmailEvent: {
      senderEmail: pending.senderEmail,
      subject: pending.subject,
      originalMessageId: pending.originalMessageId,
    },
    pendingTranslationRequest: undefined,
    processedTranslationKeys: nextProcessedKeys.slice(-maxProcessedKeys),
  });

  for (const event of events) {
    await queue.enqueue(event);
  }
}

function createPendingRequest(input: {
  senderEmail: string;
  raw: RawEmailMessage;
  inboundEmailAddress: string;
  attachments: Array<{ id: string; filename: string | null; contentType: string }>;
  intent: EmailRequestIntent;
}) {
  const subject = input.raw.subject ?? "";
  const emailId = input.raw.emailId ?? "";
  const originalMessageId = input.raw.messageId ?? "";

  return {
    requestId: createRequestId(`${emailId}:${originalMessageId}:${subject}`),
    senderEmail: input.senderEmail,
    subject,
    originalMessageId,
    emailId,
    inboundEmailAddress: input.inboundEmailAddress,
    attachments: input.attachments,
    sourceLocale: input.intent.sourceLocale,
    targetLocale: input.intent.targetLocale,
    instructions: input.intent.instructions,
  } satisfies PendingEmailTranslationRequest;
}

async function handlePendingClarification(input: {
  thread: Thread<EmailBotState>;
  message: Message;
  pending: PendingEmailTranslationRequest;
  dependencies: EmailHandlerDependencies;
}) {
  const { thread, message, pending, dependencies } = input;
  const log = logger.child({ req: pending.requestId });
  log.info("handling pending clarification");

  if (isAffirmative(message.text) && pending.targetLocale) {
    log.info("affirmative response, proceeding with translation");
    await enqueuePendingTranslation({
      thread,
      queue: dependencies.queue,
      fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
      pending,
    });
    return;
  }

  const intent = await dependencies.interpretClarificationReply({
    text: message.text,
  });
  log.info(
    {
      confidence: intent.confidence,
      missingFields: intent.missingFields,
    },
    "clarification intent interpreted",
  );

  const nextPending = {
    ...pending,
    sourceLocale: intent.sourceLocale ?? pending.sourceLocale,
    targetLocale: intent.targetLocale ?? pending.targetLocale,
    instructions: intent.instructions ?? pending.instructions,
  };

  if (!nextPending.targetLocale) {
    log.info("still missing target locale after clarification");
    await thread.post(buildClarificationMessage(nextPending));
    await thread.setState({ pendingTranslationRequest: nextPending });
    return;
  }

  if (intent.confidence < intentConfirmationThreshold && !isAffirmative(message.text)) {
    log.info(
      { confidence: intent.confidence },
      "low confidence after clarification, requesting confirmation",
    );
    await thread.post(buildConfirmationMessage(nextPending));
    await thread.setState({ pendingTranslationRequest: nextPending });
    return;
  }

  await enqueuePendingTranslation({
    thread,
    queue: dependencies.queue,
    fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
    pending: nextPending,
  });
}

export function createEmailHandler(dependencies: EmailHandlerDependencies) {
  return async function handleEmail(thread: Thread<EmailBotState>, message: Message) {
    const senderEmail = message.author.userId;
    const raw = message.raw as RawEmailMessage;
    const log = logger.child({ thread: thread.id });
    log.info(
      {
        messageId: raw.messageId,
        attachmentCount: raw.attachments?.length ?? 0,
      },
      "handling email",
    );

    try {
      const user = await dependencies.lookupUserByEmail(senderEmail);

      if (!user) {
        log.warn("unknown sender");
        await thread.post(
          [
            "This inbox only accepts requests from members of the Hyperlocalise workspace that owns it.",
            "",
            "If you already have an account, try sending from your workspace email address, or ask an admin to invite you.",
            "",
            "—Hyperlocalise Agent",
          ].join("\n"),
        );
        return;
      }

      const state = await thread.state;
      let pending = state?.pendingTranslationRequest;
      const attachments = raw.attachments ?? [];

      if (pending && pending.senderEmail === senderEmail) {
        if (attachments.length > 0) {
          const fileAttachments = attachments.filter(
            (att) => !att.contentType.startsWith("image/"),
          );
          if (fileAttachments.length > 0) {
            log.info(
              { newAttachmentCount: fileAttachments.length },
              "merging new attachments into pending clarification",
            );
            pending = {
              ...pending,
              attachments: [...pending.attachments, ...fileAttachments],
            };
          }
        }
        log.info("resuming pending clarification");
        await handlePendingClarification({ thread, message, pending, dependencies });
        return;
      }

      const organization = await dependencies.resolveInboundEmailOrganization({
        senderUserId: user.id,
        recipientAddresses: raw.to ?? [],
      });

      if (!organization) {
        log.warn("no organization found");
        await thread.post(
          [
            "This inbound email address isn't active for one of your organizations.",
            "",
            "Please use the active email address shown in Hyperlocalise, or ask an admin to enable the email agent.",
            "",
            "—Hyperlocalise Agent",
          ].join("\n"),
        );
        return;
      }

      if (attachments.length === 0) {
        log.info("no attachments, sending help");
        await thread.post(buildSupportedRequestHelp());
        return;
      }

      if (!raw.emailId || !raw.messageId) {
        log.error({ messageId: raw.messageId }, "missing email metadata");
        await thread.post(
          [
            "Sorry — I couldn't process this email because some technical metadata was missing.",
            "",
            "Please resend the request. If this keeps happening, contact support and include the original message.",
            "",
            "—Hyperlocalise Agent",
          ].join("\n"),
        );
        return;
      }

      const imageAttachments = message.attachments.filter((att) => att.type === "image");
      const fileAttachments = attachments.filter((att) => !att.contentType.startsWith("image/"));
      if (imageAttachments.length === 0 && fileAttachments.length === 0) {
        log.info("no supported attachments found");
        return;
      }

      const intent = await dependencies.interpretEmailRequest({
        subject: raw.subject ?? "",
        text: message.text,
      });
      log.info(
        {
          confidence: intent.confidence,
          missingFields: intent.missingFields,
        },
        "intent interpreted",
      );

      if (imageAttachments.length > 0) {
        if (!intent.targetLocale) {
          log.info("missing target locale for image localization");
          await thread.post(
            [
              "I received your image, but I need the target language before I can localize it.",
              "",
              "Please resend the image with a target language. For example:",
              "- Target: Japanese",
              "- English to Vietnamese",
              "",
              "—Hyperlocalise Agent",
            ].join("\n"),
          );
          return;
        } else if (intent.confidence < intentConfirmationThreshold) {
          log.info(
            { confidence: intent.confidence },
            "low confidence for image localization, requesting resend with clearer intent",
          );
          if (fileAttachments.length === 0) {
            await thread.post(
              [
                "I received your image, but I'm not quite sure about the localization request.",
                "",
                "Please resend it with the target language and any specific instructions you have in mind.",
                "",
                "—Hyperlocalise Agent",
              ].join("\n"),
            );
            return;
          }
        } else {
          log.info({ count: imageAttachments.length }, "handling image attachments");
          for (const imageAttachment of imageAttachments) {
            await dependencies.handleImageAttachment(thread, message, imageAttachment, raw, intent);
          }
        }
      }

      if (fileAttachments.length === 0) {
        log.info("no file attachments after filtering images");
        return;
      }

      const pendingRequest = createPendingRequest({
        senderEmail,
        raw,
        inboundEmailAddress: organization.inboundEmailAddress,
        attachments: fileAttachments,
        intent,
      });

      if (!pendingRequest.targetLocale) {
        log.info("missing target locale, requesting clarification");
        await thread.post(buildClarificationMessage(pendingRequest));
        await thread.setState({ pendingTranslationRequest: pendingRequest });
        return;
      }

      if (intent.confidence < intentConfirmationThreshold) {
        log.info({ confidence: intent.confidence }, "low confidence, requesting confirmation");
        await thread.post(buildConfirmationMessage(pendingRequest));
        await thread.setState({ pendingTranslationRequest: pendingRequest });
        return;
      }

      await enqueuePendingTranslation({
        thread,
        queue: dependencies.queue,
        fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
        pending: pendingRequest,
      });
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "unhandled error in email handler",
      );
      throw error;
    }
  };
}

export async function getEmailBot(options?: { emailTranslationQueue?: EmailTranslationQueue }) {
  if (botInstance) {
    return botInstance;
  }

  botQueue = options?.emailTranslationQueue ?? createEmailTranslationQueue();
  const handleEmail = createEmailHandler({
    queue: botQueue,
    lookupUserByEmail,
    resolveInboundEmailOrganization,
    interpretEmailRequest,
    interpretClarificationReply,
    fetchAttachmentDownloadUrls,
    handleImageAttachment,
  });

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
        logger: createChatLogger("resend"),
      }),
    },
    logger: createChatLogger("chat"),
    state: createChatStateAdapter(),
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
