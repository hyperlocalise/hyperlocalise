import { Chat, emoji } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread, UserInfo } from "chat";

import {
  classifyConversation,
  createConversationToolLoopAgent,
  getRecentUserConversationText,
  loadInteractionModelMessages,
  replaceLastUserMessage,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import {
  buildFileTranslationInstructions,
  getOrCreateConversationRepositorySandbox,
  resolveConversationRepositoryContext,
  stopStaleRepositorySandbox,
} from "@/lib/agent-runtime/loops/conversation-turn";
import { resolveOrganizationHasTmsIntegration } from "@/lib/agent-runtime/skills/conversation-tms-integration";
import { stopRepositorySandbox } from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import {
  postThreadMessageWithoutTracking,
  wrapThreadPostForInteraction,
} from "@/lib/agent-runtime/runs/agent-run-events";
import { db } from "@/lib/database";
import { env } from "@/lib/env";
import { createChatLogger, createLogger, serializeErrorForLog } from "@/lib/log";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
  interactionHasTranslationAttachments,
  updateInteractionMessage,
} from "@/lib/conversations/interactions";

import { findSlackConnector, lookupMembership } from "@/lib/agents/slack/helpers";
import {
  appendSlackStoredFileContext,
  buildUnsupportedSlackFilesMessage,
  getSlackTranslationFileAttachments,
  getUnsupportedSlackFileAttachments,
  storeSlackFileAttachments,
} from "@/lib/agents/slack/file-attachments";
import {
  getSlackImageAttachments,
  handleSlackImageAttachments,
  handleSlackImageFollowUp,
} from "@/lib/agents/slack/image-attachments";
import { threadHasStoredSlackImages } from "@/lib/agents/slack/image-session";
import { type SlackBotThreadState } from "@/lib/agents/slack/repository-session";

type SlackBotState = SlackBotThreadState;

const logger = createLogger("slack-bot");

const SLACK_PROCESSING_ACK_MESSAGE = "On it — I'll reply here shortly.";

let botInstance: Chat<{ slack: ReturnType<typeof createSlackAdapter> }, SlackBotState> | null =
  null;

export function extractTeamId(message: Message): string | null {
  const raw = message.raw as { team_id?: string; team?: string } | undefined;
  return raw?.team_id ?? raw?.team ?? null;
}

async function getSlackUser(
  thread: Thread<SlackBotState>,
  userId: string,
): Promise<UserInfo | null> {
  return (await thread.adapter.getUser?.(userId)) ?? null;
}

export function wrapThreadPost(thread: Thread<SlackBotState>, interactionId: string) {
  wrapThreadPostForInteraction(thread, interactionId);
}

async function warnUnauthorizedSlackSender(
  thread: Thread<SlackBotState>,
  message: Message,
  log: ReturnType<typeof logger.child>,
) {
  log.warn("slack agent membership lookup failed");

  const state = await thread.state;
  const warnedUsers = (state?.warnedNonMemberUsers as string[] | undefined) ?? [];

  if (warnedUsers.includes(message.author.userId)) {
    await removeEyesReaction(thread, message);
    await thread.adapter.addReaction(thread.id, message.id, emoji.x).catch(() => {});
    return;
  }

  await removeEyesReaction(thread, message);
  await thread.post({
    markdown:
      "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
  });
  await thread.setState({
    warnedNonMemberUsers: [...warnedUsers, message.author.userId],
  });
}

export async function getOrCreateInteraction(
  organizationId: string,
  threadId: string,
  title: string,
): Promise<{
  interaction: { id: string; title: string; projectId: string | null };
  isNew: boolean;
}> {
  const existing = await findInteractionBySourceThreadId({
    organizationId,
    source: "slack_agent",
    sourceThreadId: threadId,
  });
  if (existing) {
    return {
      interaction: existing as { id: string; title: string; projectId: string | null },
      isNew: false,
    };
  }
  const interaction = await createInteraction({
    organizationId,
    source: "slack_agent",
    title,
    sourceThreadId: threadId,
  });
  return {
    interaction: interaction as { id: string; title: string; projectId: string | null },
    isNew: true,
  };
}

function getSlackChannelId(thread: Thread<SlackBotState>, message: Message): string | null {
  const channelId = thread.channelId;
  if (typeof channelId === "string" && channelId.length > 0) {
    return channelId;
  }

  const raw = message.raw as { channel?: string } | undefined;
  return raw?.channel ?? null;
}

async function removeEyesReaction(thread: Thread<SlackBotState>, message: Message): Promise<void> {
  await thread.adapter.removeReaction(thread.id, message.id, emoji.eyes).catch(() => {
    // Ignore reaction failures
  });
}

type ProcessSlackMessageOptions = {
  isNewInteraction?: boolean;
};

async function postSlackProcessingAck(thread: Thread<SlackBotState>) {
  await postThreadMessageWithoutTracking(thread, {
    markdown: SLACK_PROCESSING_ACK_MESSAGE,
  });
}

async function processSlackMessage(
  thread: Thread<SlackBotState>,
  message: Message,
  interactionId: string,
  organizationId: string,
  projectId: string | null,
  connectorConfig: Record<string, unknown> | null,
  options: ProcessSlackMessageOptions = {},
) {
  const channelId = getSlackChannelId(thread, message);
  const log = logger.child({
    interactionId,
    organizationId,
    projectId,
    slackThreadId: thread.id,
    slackMessageId: message.id,
    slackChannelId: channelId,
  });

  try {
    await thread.adapter.addReaction(thread.id, message.id, emoji.eyes).catch(() => {
      // Ignore reaction failures so message processing continues
    });

    const slackUser = await getSlackUser(thread, message.author.userId);
    log.info(
      {
        hasSlackUser: Boolean(slackUser),
        hasSlackUserEmail: Boolean(slackUser?.email),
      },
      "processing slack agent message",
    );

    const membership = slackUser?.email
      ? await lookupMembership({ email: slackUser.email, organizationId })
      : null;

    if (!membership) {
      await warnUnauthorizedSlackSender(thread, message, log);
      return;
    }

    const persistedMessage = await addInteractionMessage({
      interactionId,
      senderType: "user",
      text: message.text,
      senderEmail: slackUser?.email,
    });

    const imageAttachments = getSlackImageAttachments(message);
    const fileAttachments = getSlackTranslationFileAttachments(message);
    const unsupportedFileAttachments = getUnsupportedSlackFileAttachments(message);
    log.info(
      {
        imageAttachmentCount: imageAttachments.length,
        fileAttachmentCount: fileAttachments.length,
        unsupportedFileAttachmentCount: unsupportedFileAttachments.length,
      },
      "slack agent attachments classified",
    );
    const storedFileAttachments =
      fileAttachments.length > 0
        ? await storeSlackFileAttachments({
            attachments: fileAttachments,
            organizationId,
            projectId,
            createdByUserId: membership.localUserId,
            interactionId,
          })
        : [];
    const persistedUserText = appendSlackStoredFileContext(message.text, storedFileAttachments);
    const interactionAttachments = storedFileAttachments.map((file) => ({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      url: file.url,
    }));

    if (interactionAttachments.length > 0) {
      await updateInteractionMessage(persistedMessage.id, {
        text: persistedUserText,
        attachments: interactionAttachments,
      });
    }

    if (unsupportedFileAttachments.length > 0) {
      await removeEyesReaction(thread, message);
      wrapThreadPost(thread, interactionId);
      await thread.post({
        markdown: buildUnsupportedSlackFilesMessage(unsupportedFileAttachments),
      });

      if (storedFileAttachments.length === 0 && imageAttachments.length === 0) {
        return;
      }
    }

    const hasTranslationAttachments = await interactionHasTranslationAttachments(interactionId);
    const threadState = (await thread.state) as SlackBotThreadState | null;
    const imageStorageContext = {
      organizationId,
      projectId,
      createdByUserId: membership.localUserId,
      interactionId,
    };
    const shouldPostProcessingAck =
      options.isNewInteraction === true ||
      storedFileAttachments.length > 0 ||
      imageAttachments.length > 0 ||
      hasTranslationAttachments ||
      (imageAttachments.length === 0 && threadHasStoredSlackImages(threadState));

    if (shouldPostProcessingAck) {
      await postSlackProcessingAck(thread);
    }

    const loadedMessages = await loadInteractionModelMessages(interactionId);
    const conversationText = getRecentUserConversationText(loadedMessages, persistedUserText);
    const imageIntentMessages = loadedMessages.flatMap((chatMessage) => {
      if (
        (chatMessage.role !== "user" && chatMessage.role !== "assistant") ||
        typeof chatMessage.content !== "string"
      ) {
        return [];
      }
      return [{ role: chatMessage.role, content: chatMessage.content }];
    });
    const storedRepositoryContext = threadState?.repositoryGitHubContext ?? null;
    const classification = await classifyConversation({
      currentMessage: message.text,
      conversationText,
      hasFileAttachments: hasTranslationAttachments,
      hasStoredRepositoryContext: Boolean(storedRepositoryContext),
      surface: "slack",
    });
    log.info(
      {
        needsRepositoryTools: classification.needsRepositoryTools,
        continuesRepositoryThread: classification.continuesRepositoryThread,
        hasStoredRepositoryContext: Boolean(storedRepositoryContext),
        hasConnectorConfig: Boolean(connectorConfig),
      },
      "slack agent conversation classified",
    );

    const repositoryResolution = await resolveConversationRepositoryContext({
      surface: "slack",
      organizationId,
      projectId,
      conversationText,
      classification,
      repositorySession: threadState,
      connectorConfig,
      channelId,
    });

    if (repositoryResolution.clarificationFollowUp) {
      await removeEyesReaction(thread, message);
      wrapThreadPost(thread, interactionId);
      await thread.post({ markdown: repositoryResolution.clarificationFollowUp });
      return;
    }

    const resolvedRepositoryContext = repositoryResolution.context;
    const repositoryContextInstructions = repositoryResolution.instructions;
    let updatedThreadState = repositoryResolution.updatedSession;

    if (updatedThreadState?.repositoryGitHubContext) {
      await thread.setState({
        ...threadState,
        repositoryGitHubContext: updatedThreadState.repositoryGitHubContext,
      });
    }

    const chatMessages = replaceLastUserMessage(
      loadedMessages,
      resolvedRepositoryContext
        ? getRecentUserConversationText(loadedMessages, persistedUserText)
        : persistedUserText,
    );

    if (imageAttachments.length > 0) {
      await removeEyesReaction(thread, message);
      wrapThreadPost(thread, interactionId);
      await handleSlackImageAttachments(thread, message, {
        imageAttachments,
        conversationMessages: imageIntentMessages,
        threadState,
        storage: imageStorageContext,
        beforePostGeneratedImage: async () => {
          await removeEyesReaction(thread, message);
        },
      });

      if (storedFileAttachments.length === 0) {
        return;
      }
    } else if (threadHasStoredSlackImages(threadState)) {
      await removeEyesReaction(thread, message);
      const followUpResult = await handleSlackImageFollowUp(thread, message, {
        conversationMessages: imageIntentMessages,
        threadState,
        storage: imageStorageContext,
        beforeLocalize: () => {
          wrapThreadPost(thread, interactionId);
        },
        beforePostGeneratedImage: async () => {
          await removeEyesReaction(thread, message);
        },
      });

      if (followUpResult.handled) {
        return;
      }
    }

    const latestThreadState = (await thread.state) as SlackBotThreadState | null;
    let sandboxId: string | null = null;
    if (resolvedRepositoryContext) {
      const sandboxResult = await getOrCreateConversationRepositorySandbox({
        conversationId: interactionId,
        surface: "slack",
        githubContext: resolvedRepositoryContext,
        repositorySession: updatedThreadState ?? latestThreadState,
      });
      sandboxId = sandboxResult.sandboxId;
      updatedThreadState = sandboxResult.updatedSession;
      try {
        await thread.setState({
          ...latestThreadState,
          ...updatedThreadState,
        });
        await stopStaleRepositorySandbox(sandboxResult.staleSandboxId, log);
      } catch (error) {
        if (sandboxResult.sandboxCreated) {
          await stopRepositorySandbox(sandboxResult.sandboxId).catch((cleanupError: unknown) => {
            log.warn(
              { err: serializeErrorForLog(cleanupError), sandboxId: sandboxResult.sandboxId },
              "repository sandbox cleanup failed after slack state write failure",
            );
          });
        }
        throw error;
      }
    }

    const hasTmsIntegration = await resolveOrganizationHasTmsIntegration(organizationId);

    const agent = createConversationToolLoopAgent({
      surface: "slack",
      toolContext: {
        conversationId: interactionId,
        organizationId,
        localUserId: membership.localUserId,
        membershipRole: membership.role,
        projectId,
        db,
        ...(sandboxId
          ? {
              sandboxId,
              githubContext: resolvedRepositoryContext,
              workMode: "read_only" as const,
              repositorySource: "slack" as const,
              actor: {
                sourceUserId: message.author.userId,
                userId: membership.localUserId,
                role: membership.role,
              },
            }
          : {}),
      },
      hasFileAttachments: hasTranslationAttachments,
      hasTmsIntegration,
      additionalInstructions: [buildFileTranslationInstructions(), repositoryContextInstructions]
        .filter((instruction): instruction is string => instruction !== null)
        .join("\n\n"),
    });
    log.info(
      {
        hasRepositoryContext: Boolean(resolvedRepositoryContext),
        hasSandbox: Boolean(sandboxId),
        hasFileAttachments: hasTranslationAttachments,
      },
      "running slack conversation agent",
    );
    const result = await agent.generate({ messages: chatMessages });
    log.info(
      {
        hasReplyText: result.text.trim().length > 0,
      },
      "slack conversation agent completed",
    );

    await removeEyesReaction(thread, message);
    wrapThreadPost(thread, interactionId);
    const replyText = result.text.trim();
    if (replyText) {
      await thread.post({ markdown: replyText });
    }
  } catch (error) {
    log.error({ err: serializeErrorForLog(error) }, "slack agent message processing failed");
    await removeEyesReaction(thread, message);
    wrapThreadPost(thread, interactionId);
    await thread.post({
      markdown:
        "I'm having trouble processing that right now. Attach a supported file or image with a target language and I can help translate it.",
    });
  }
}

export async function handleNewConversation(thread: Thread<SlackBotState>, message: Message) {
  if (message.author.isBot) {
    return;
  }

  const teamId = extractTeamId(message);
  if (!teamId) {
    return;
  }

  const connector = await findSlackConnector(teamId);
  if (!connector) {
    return;
  }

  const slackUser = await getSlackUser(thread, message.author.userId);
  const membership = slackUser?.email
    ? await lookupMembership({ email: slackUser.email, organizationId: connector.organizationId })
    : null;
  if (!membership) {
    await warnUnauthorizedSlackSender(
      thread,
      message,
      logger.child({ slackThreadId: thread.id, organizationId: connector.organizationId }),
    );
    return;
  }

  const { interaction, isNew } = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  if (isNew) {
    wrapThreadPost(thread, interaction.id);
    await thread.subscribe();
  }

  await processSlackMessage(
    thread,
    message,
    interaction.id,
    connector.organizationId,
    interaction.projectId,
    (connector.config ?? null) as Record<string, unknown> | null,
    { isNewInteraction: isNew },
  );
}

export async function handleSubscribedMessage(thread: Thread<SlackBotState>, message: Message) {
  if (message.author.isBot) {
    return;
  }

  const teamId = extractTeamId(message);
  if (!teamId) {
    return;
  }

  const connector = await findSlackConnector(teamId);
  if (!connector) {
    return;
  }

  const slackUser = await getSlackUser(thread, message.author.userId);
  const membership = slackUser?.email
    ? await lookupMembership({ email: slackUser.email, organizationId: connector.organizationId })
    : null;
  if (!membership) {
    await warnUnauthorizedSlackSender(
      thread,
      message,
      logger.child({ slackThreadId: thread.id, organizationId: connector.organizationId }),
    );
    return;
  }

  const { interaction } = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  await processSlackMessage(
    thread,
    message,
    interaction.id,
    connector.organizationId,
    interaction.projectId,
    (connector.config ?? null) as Record<string, unknown> | null,
    { isNewInteraction: false },
  );
}

export async function getSlackBot() {
  if (botInstance) {
    return botInstance;
  }

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_SIGNING_SECRET) {
    throw new Error("missing Slack bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      slack: createSlackAdapter({
        clientId: env.SLACK_CLIENT_ID,
        clientSecret: env.SLACK_CLIENT_SECRET,
        signingSecret: env.SLACK_SIGNING_SECRET,
        userName: "hyperlocalise",
        logger: createChatLogger("slack"),
      }),
    },
    logger: createChatLogger("chat"),
    state: createChatStateAdapter(),
    userName: "hyperlocalise",
  });

  botInstance.onNewMention(handleNewConversation);
  botInstance.onDirectMessage(handleNewConversation);
  botInstance.onSubscribedMessage(handleSubscribedMessage);

  return botInstance;
}
