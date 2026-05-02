import { createHash } from "node:crypto";
import { Chat } from "chat";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import { createChatLogger, createLogger } from "@/lib/log";
import { createResendAdapter } from "@/lib/resend/adapter";
import type { EmailAgentTask, EmailAgentTaskQueue } from "@/lib/workflow/types";
import { createEmailAgentTaskQueue } from "@/workflows/adapters";

import { fetchAttachmentDownloadUrls } from "./attachments";
import { handleImageAttachment } from "./image-attachments";
import {
  type EmailRequestIntent,
  interpretClarificationReply,
  interpretEmailRequest,
} from "./intent";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
  linkJobToInteraction,
} from "@/lib/interactions";
import { resolveInboundEmailOrganization } from "./organizations";
import type { EmailBotState, PendingEmailAgentTask, RawEmailMessage } from "./types";
import { lookupUserByEmail } from "./users";

export { interpretClarificationReply };

let botInstance: Chat<{ resend: ReturnType<typeof createResendAdapter> }, EmailBotState> | null =
  null;
let botQueue: EmailAgentTaskQueue | null = null;

const logger = createLogger("email-bot");

export type EmailHandlerDependencies = {
  queue: EmailAgentTaskQueue;
  lookupUserByEmail: typeof lookupUserByEmail;
  resolveInboundEmailOrganization: typeof resolveInboundEmailOrganization;
  interpretEmailRequest: typeof interpretEmailRequest;
  interpretClarificationReply: typeof interpretClarificationReply;
  fetchAttachmentDownloadUrls: typeof fetchAttachmentDownloadUrls;
  handleImageAttachment: typeof handleImageAttachment;
  trackConversation?: {
    create: typeof createInteraction;
    addMessage: typeof addInteractionMessage;
    findBySourceThreadId: typeof findInteractionBySourceThreadId;
    linkJob: typeof linkJobToInteraction;
  };
};

const intentConfirmationThreshold = 0.85;
const maxProcessedKeys = 100;

function createRequestId(input: string) {
  return `eml_${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

function createEmailAgentTaskKey(input: {
  kind: EmailAgentTask["kind"];
  emailId: string;
  attachmentId: string;
  sourceLocale: string | null;
  targetLocale: string;
  instructions: string | null;
}) {
  return [
    input.kind,
    input.emailId,
    input.attachmentId,
    (input.sourceLocale ?? "auto").toLowerCase(),
    input.targetLocale.toLowerCase(),
    (input.instructions?.trim() || "default").toLowerCase(),
  ].join(":");
}

function attachmentName(att: { filename: string | null; id: string }) {
  return att.filename ?? `attachment-${att.id}`;
}

function formatPendingAttachmentList(pending: PendingEmailAgentTask) {
  const fileLines = pending.attachments.map((att) => `- ${attachmentName(att)}`);
  const imageLines =
    pending.imageAttachments?.map((att, index) => `- ${att.name ?? `image-${index + 1}`}`) ?? [];
  return [...imageLines, ...fileLines].join("\n");
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

function buildUnsupportedCapabilityMessage(intent: EmailRequestIntent) {
  const label =
    intent.kind === "check"
      ? "localization checks"
      : intent.kind === "keyword_research"
        ? "localized keyword research"
        : "that request";

  return [
    `I can't handle ${label} by email yet.`,
    "",
    "For now, this inbox can translate supported files and localize images when you include a target language.",
    "",
    "—Hyperlocalise Agent",
  ].join("\n");
}

function buildImageStateLostMessage(pending: PendingEmailAgentTask) {
  return [
    "I couldn't recover the image attachment after confirmation, so I can't localize that image from this reply.",
    "",
    "Please resend the image with the target language if you still need the image localized.",
    "",
    "—Hyperlocalise Agent",
    `Request ID: ${pending.requestId}`,
  ].join("\n");
}

function buildClarificationMessage(pending: PendingEmailAgentTask) {
  const missing = [pending.targetLocale ? null : "target language"].filter(Boolean);

  return [
    `Thanks for sending ${pending.attachments.length === 1 ? "that file" : "those files"}. Before I can start, could you let me know the ${missing.join(" and ")}?`,
    "",
    "Files:",
    formatPendingAttachmentList(pending),
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

function buildConfirmationMessage(pending: PendingEmailAgentTask) {
  return [
    'I think I understood your request. Please reply "yes" to start, or send corrected locales if anything looks off.',
    "",
    "Files:",
    formatPendingAttachmentList(pending),
    "",
    pending.sourceLocale ? `Source: ${pending.sourceLocale}` : "Source: auto-detect",
    `Target: ${pending.targetLocale}`,
    pending.instructions ? `Instructions: ${pending.instructions}` : null,
    "",
    "—Hyperlocalise Agent",
    `Request ID: ${pending.requestId}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function buildIntakeReceipt(input: {
  pending: PendingEmailAgentTask;
  skippedDuplicateCount: number;
}) {
  const lines = [
    `Thanks. I've queued ${input.pending.attachments.length === 1 ? "the file" : "the files"} for translation into ${input.pending.targetLocale}. You should receive the finished ${input.pending.attachments.length === 1 ? "file" : "files"} in this thread shortly — usually within a minute or two.`,
    "",
    "Files:",
    formatPendingAttachmentList(input.pending),
    "",
    input.pending.sourceLocale ? `Source: ${input.pending.sourceLocale}` : "Source: auto-detect",
    `Target: ${input.pending.targetLocale}`,
    input.pending.instructions ? `Instructions applied: ${input.pending.instructions}` : null,
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
  queue: EmailAgentTaskQueue;
  fetchAttachmentDownloadUrls: typeof fetchAttachmentDownloadUrls;
  handleImageAttachment: typeof handleImageAttachment;
  pending: PendingEmailAgentTask;
  organizationId?: string;
  conversationId?: string;
  linkJob?: typeof linkJobToInteraction;
}) {
  const {
    thread,
    queue,
    fetchAttachmentDownloadUrls,
    handleImageAttachment,
    pending,
    organizationId,
    conversationId,
    linkJob,
  } = input;
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
    await thread.setState({ pendingEmailAgentTask: pending });
    return;
  }

  let pendingForReceipt = pending;
  if (pending.imageAttachments && pending.imageAttachments.length > 0) {
    log.info({ count: pending.imageAttachments.length }, "handling pending image attachments");
    const imageMessage = pending.imageMessage;
    const rawForImage = pending.imageRaw ?? {
      emailId: pending.emailId,
      messageId: pending.originalMessageId,
      subject: pending.subject,
    };
    const imageIntent: EmailRequestIntent = {
      kind: "translate",
      sourceLocale: pending.sourceLocale,
      targetLocale: pending.targetLocale,
      instructions: pending.instructions,
      confidence: 1,
      missingFields: [],
    };
    if (imageMessage) {
      for (const imageAttachment of pending.imageAttachments) {
        await handleImageAttachment(
          thread,
          imageMessage,
          imageAttachment,
          rawForImage,
          imageIntent,
        );
      }
    } else {
      log.warn("pending image attachments are missing source message data");
      await thread.post(buildImageStateLostMessage(pending));
      pendingForReceipt = {
        ...pending,
        imageAttachments: undefined,
      };
    }
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
  const processedKeys = new Set(state?.processedEmailAgentTaskKeys ?? []);
  const nextProcessedKeys = [...processedKeys];
  const tasks: EmailAgentTask[] = [];
  let skippedDuplicateCount = 0;

  for (const att of attachmentUrls) {
    const key = createEmailAgentTaskKey({
      kind: pending.kind,
      emailId: pending.emailId,
      attachmentId: att.id,
      sourceLocale: pending.sourceLocale,
      targetLocale: pending.targetLocale,
      instructions: pending.instructions,
    });

    if (processedKeys.has(key)) {
      log.info({ key }, "skipping duplicate translation");
      skippedDuplicateCount += 1;
      continue;
    }

    processedKeys.add(key);
    nextProcessedKeys.push(key);
    tasks.push({
      kind: "translate",
      requestId: pending.requestId,
      senderEmail: pending.senderEmail,
      subject: pending.subject,
      originalMessageId: pending.originalMessageId,
      inboundEmailAddress: pending.inboundEmailAddress,
      inputs: {
        attachments: [
          {
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            downloadUrl: att.downloadUrl,
          },
        ],
      },
      parameters: {
        translate: {
          sourceLocale: pending.sourceLocale,
          targetLocale: pending.targetLocale,
          instructions: pending.instructions,
        },
      },
      replyPolicy: {
        type: "threaded_email",
      },
    });
  }

  if (tasks.length === 0) {
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
    await thread.setState({ pendingEmailAgentTask: undefined });
    return;
  }

  for (const task of tasks) {
    const result = await queue.enqueue(task);
    if (organizationId && conversationId && linkJob && result.ids.length > 0) {
      try {
        for (const jobId of result.ids) {
          await linkJob({ organizationId, jobId, interactionId: conversationId });
        }
      } catch {
        // Best-effort linking; don't fail the email flow.
      }
    }
  }

  log.info({ taskCount: tasks.length, skippedDuplicateCount }, "email agent tasks enqueued");

  await thread.setState({
    lastEmailEvent: {
      senderEmail: pending.senderEmail,
      subject: pending.subject,
      originalMessageId: pending.originalMessageId,
    },
    pendingEmailAgentTask: undefined,
    processedEmailAgentTaskKeys: nextProcessedKeys.slice(-maxProcessedKeys),
  });

  await thread.post(buildIntakeReceipt({ pending: pendingForReceipt, skippedDuplicateCount }));
}

function createPendingRequest(input: {
  senderEmail: string;
  raw: RawEmailMessage;
  inboundEmailAddress: string;
  attachments: Array<{ id: string; filename: string | null; contentType: string }>;
  imageAttachments?: Message["attachments"];
  imageMessage?: Message;
  intent: EmailRequestIntent;
}) {
  const subject = input.raw.subject ?? "";
  const emailId = input.raw.emailId ?? "";
  const originalMessageId = input.raw.messageId ?? "";

  return {
    kind: "translate",
    requestId: createRequestId(`${emailId}:${originalMessageId}:${subject}`),
    senderEmail: input.senderEmail,
    subject,
    originalMessageId,
    emailId,
    inboundEmailAddress: input.inboundEmailAddress,
    attachments: input.attachments,
    imageAttachments: input.imageAttachments,
    imageMessage: input.imageMessage,
    imageRaw: {
      emailId,
      messageId: originalMessageId,
      subject,
    },
    sourceLocale: input.intent.sourceLocale,
    targetLocale: input.intent.targetLocale,
    instructions: input.intent.instructions,
  } satisfies PendingEmailAgentTask;
}

async function handlePendingClarification(input: {
  thread: Thread<EmailBotState>;
  message: Message;
  pending: PendingEmailAgentTask;
  dependencies: EmailHandlerDependencies;
  organizationId?: string;
  conversationId?: string;
}) {
  const { thread, message, pending, dependencies, organizationId, conversationId } = input;
  const log = logger.child({ req: pending.requestId });
  log.info("handling pending clarification");

  if (isAffirmative(message.text) && pending.targetLocale) {
    log.info("affirmative response, proceeding with translation");
    await enqueuePendingTranslation({
      thread,
      queue: dependencies.queue,
      fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
      handleImageAttachment: dependencies.handleImageAttachment,
      pending,
      organizationId,
      conversationId,
      linkJob: dependencies.trackConversation?.linkJob,
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
    await thread.setState({ pendingEmailAgentTask: nextPending });
    return;
  }

  if (intent.confidence < intentConfirmationThreshold && !isAffirmative(message.text)) {
    log.info(
      { confidence: intent.confidence },
      "low confidence after clarification, requesting confirmation",
    );
    await thread.post(buildConfirmationMessage(nextPending));
    await thread.setState({ pendingEmailAgentTask: nextPending });
    return;
  }

  await enqueuePendingTranslation({
    thread,
    queue: dependencies.queue,
    fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
    handleImageAttachment: dependencies.handleImageAttachment,
    pending: nextPending,
    organizationId,
    conversationId,
    linkJob: dependencies.trackConversation?.linkJob,
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
      let pending = state?.pendingEmailAgentTask;
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
        // Conversation tracking for pending clarification
        let conversationId: string | undefined;
        let conversationOrganizationId: string | undefined;
        const track = dependencies.trackConversation;
        if (track) {
          try {
            const organization = await dependencies.resolveInboundEmailOrganization({
              senderUserId: user.id,
              recipientAddresses: raw.to ?? [],
            });
            if (organization) {
              conversationOrganizationId = organization.id;
              const existing = await track.findBySourceThreadId({
                organizationId: organization.id,
                source: "email_agent",
                sourceThreadId: thread.id,
              });
              if (existing) {
                conversationId = existing.id;
                await track.addMessage({
                  interactionId: conversationId,
                  senderType: "user",
                  text: message.text,
                  senderEmail,
                });
              }
            }
          } catch (trackError) {
            log.error(
              { error: trackError instanceof Error ? trackError.message : String(trackError) },
              "conversation tracking failed",
            );
          }
        }

        // Wrap thread.post to also save agent messages
        const originalPost = thread.post.bind(thread);
        const trackedPost = async (...args: Parameters<typeof originalPost>) => {
          const result = await originalPost(...args);
          if (track && conversationId) {
            try {
              const text = typeof args[0] === "string" ? args[0] : "";
              if (text) {
                await track.addMessage({
                  interactionId: conversationId,
                  senderType: "agent",
                  text,
                });
              }
            } catch {
              // Best-effort tracking
            }
          }
          return result;
        };
        (thread as { post: typeof trackedPost }).post = trackedPost;

        log.info("resuming pending clarification");
        await handlePendingClarification({
          thread,
          message,
          pending,
          dependencies,
          organizationId: conversationOrganizationId,
          conversationId,
        });
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

      // Conversation tracking
      let conversationId: string | undefined;
      const track = dependencies.trackConversation;
      if (track) {
        try {
          const existing = await track.findBySourceThreadId({
            organizationId: organization.id,
            source: "email_agent",
            sourceThreadId: thread.id,
          });
          if (existing) {
            conversationId = existing.id;
          } else {
            const created = await track.create({
              organizationId: organization.id,
              source: "email_agent",
              title: raw.subject ?? "Email request",
              sourceThreadId: thread.id,
            });
            conversationId = created.id;
          }
          await track.addMessage({
            interactionId: conversationId,
            senderType: "user",
            text: message.text,
            senderEmail,
          });
        } catch (trackError) {
          log.error(
            { error: trackError instanceof Error ? trackError.message : String(trackError) },
            "conversation tracking failed",
          );
        }
      }

      // Wrap thread.post to also save agent messages
      const originalPost = thread.post.bind(thread);
      const trackedPost = async (...args: Parameters<typeof originalPost>) => {
        const result = await originalPost(...args);
        if (track && conversationId) {
          try {
            const text = typeof args[0] === "string" ? args[0] : "";
            if (text) {
              await track.addMessage({
                interactionId: conversationId,
                senderType: "agent",
                text,
              });
            }
          } catch {
            // Best-effort tracking
          }
        }
        return result;
      };
      // Replace thread.post temporarily for this handler invocation
      (thread as { post: typeof trackedPost }).post = trackedPost;

      const intent = await dependencies.interpretEmailRequest({
        subject: raw.subject ?? "",
        text: message.text,
      });
      log.info(
        {
          kind: intent.kind,
          confidence: intent.confidence,
          missingFields: intent.missingFields,
        },
        "intent interpreted",
      );

      if (intent.kind !== "translate") {
        log.info({ kind: intent.kind }, "unsupported email agent task kind");
        await thread.post(buildUnsupportedCapabilityMessage(intent));
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

      if (imageAttachments.length > 0) {
        if (!intent.targetLocale) {
          log.info("missing target locale for image localization");
          if (fileAttachments.length > 0) {
            const pendingRequest = createPendingRequest({
              senderEmail,
              raw,
              inboundEmailAddress: organization.inboundEmailAddress,
              attachments: fileAttachments,
              imageAttachments,
              imageMessage: message,
              intent,
            });
            await thread.post(buildClarificationMessage(pendingRequest));
            await thread.setState({ pendingEmailAgentTask: pendingRequest });
            return;
          }

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
        imageAttachments:
          imageAttachments.length > 0 &&
          (!intent.targetLocale || intent.confidence < intentConfirmationThreshold)
            ? imageAttachments
            : undefined,
        imageMessage:
          imageAttachments.length > 0 &&
          (!intent.targetLocale || intent.confidence < intentConfirmationThreshold)
            ? message
            : undefined,
        intent,
      });

      if (!pendingRequest.targetLocale) {
        log.info("missing target locale, requesting clarification");
        await thread.post(buildClarificationMessage(pendingRequest));
        await thread.setState({ pendingEmailAgentTask: pendingRequest });
        return;
      }

      if (intent.confidence < intentConfirmationThreshold) {
        log.info({ confidence: intent.confidence }, "low confidence, requesting confirmation");
        await thread.post(buildConfirmationMessage(pendingRequest));
        await thread.setState({ pendingEmailAgentTask: pendingRequest });
        return;
      }

      await enqueuePendingTranslation({
        thread,
        queue: dependencies.queue,
        fetchAttachmentDownloadUrls: dependencies.fetchAttachmentDownloadUrls,
        handleImageAttachment: dependencies.handleImageAttachment,
        pending: pendingRequest,
        organizationId: organization.id,
        conversationId,
        linkJob: track?.linkJob,
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

export async function getEmailBot(options?: { emailAgentTaskQueue?: EmailAgentTaskQueue }) {
  if (botInstance) {
    return botInstance;
  }

  botQueue = options?.emailAgentTaskQueue ?? createEmailAgentTaskQueue();
  const handleEmail = createEmailHandler({
    queue: botQueue,
    lookupUserByEmail,
    resolveInboundEmailOrganization,
    interpretEmailRequest,
    interpretClarificationReply,
    fetchAttachmentDownloadUrls,
    handleImageAttachment,
    trackConversation: {
      create: createInteraction,
      addMessage: addInteractionMessage,
      findBySourceThreadId: findInteractionBySourceThreadId,
      linkJob: linkJobToInteraction,
    },
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
