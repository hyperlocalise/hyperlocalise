import { Chat, emoji } from "chat";
import { randomUUID } from "node:crypto";
import { createSlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread, UserInfo } from "chat";

import {
  buildHyperlocaliseAgentIntentInstructions,
  classifyHyperlocaliseAgentIntent,
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
  replaceLastUserMessage,
} from "@/lib/agents/hyperlocalise-agent";
import { resolveSlackRepoTmsGitHubContext } from "@/lib/agents/repo-tms-context";
import {
  buildRepoTmsTaskIdempotencyKey,
  type RepoTmsAgentGitHubContext,
  type RepoTmsAgentTask,
} from "@/lib/agents/repo-tms-task";
import { createRepoTmsAgentTaskQueue } from "@/workflows/adapters";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { wrapThreadPostForInteraction } from "@/lib/agents/runtime/tracking";
import { db } from "@/lib/database";
import { env } from "@/lib/env";
import { createChatLogger } from "@/lib/log";
import { supportedFileTranslationFileFormats } from "@/lib/translation/file-formats";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
  updateInteractionMessage,
} from "@/lib/interactions";

import { findSlackConnector, lookupMembership } from "./helpers";
import {
  appendSlackStoredFileContext,
  buildUnsupportedSlackFilesMessage,
  getSlackTranslationFileAttachments,
  getUnsupportedSlackFileAttachments,
  storeSlackFileAttachments,
} from "./file-attachments";
import { getSlackImageAttachments, handleSlackImageAttachments } from "./image-attachments";

type SlackBotState = Record<string, unknown>;

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

function buildSlackFileTranslationInstructions() {
  return `When a Slack message includes stored source file IDs, create file translation jobs with type "file", the provided sourceFileId and fileFormat, targetLocales, and sourceLocale. Use sourceLocale "auto" if the user did not specify a source locale. Supported file job formats: ${supportedFileTranslationFileFormats.join(", ")}.`;
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

async function processSlackMessage(
  thread: Thread<SlackBotState>,
  message: Message,
  interactionId: string,
  organizationId: string,
  projectId: string | null,
  connectorConfig: Record<string, unknown> | null,
) {
  try {
    await thread.adapter.addReaction(thread.id, message.id, emoji.eyes).catch(() => {
      // Ignore reaction failures so message processing continues
    });

    const slackUser = await getSlackUser(thread, message.author.userId);

    const persistedMessage = await addInteractionMessage({
      interactionId,
      senderType: "user",
      text: message.text,
      senderEmail: slackUser?.email,
    });

    const membership = slackUser?.email
      ? await lookupMembership({ email: slackUser.email, organizationId })
      : null;

    if (!membership) {
      const state = await thread.state;
      const warnedUsers = (state?.warnedNonMemberUsers as string[] | undefined) ?? [];

      if (warnedUsers.includes(message.author.userId)) {
        await removeEyesReaction(thread, message);
        await thread.adapter.addReaction(thread.id, message.id, emoji.x).catch(() => {
          // Ignore reaction failures
        });
      } else {
        await removeEyesReaction(thread, message);
        wrapThreadPost(thread, interactionId);
        await thread.post({
          markdown:
            "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
        });
        await thread.setState({
          warnedNonMemberUsers: [...warnedUsers, message.author.userId],
        });
      }
      return;
    }

    const intent = classifyHyperlocaliseAgentIntent({ surface: "slack", text: message.text });
    const intentInstructions = buildHyperlocaliseAgentIntentInstructions(intent);
    const additionalInstructions = [buildSlackFileTranslationInstructions(), intentInstructions];
    let resolvedRepoTmsContext: RepoTmsAgentGitHubContext | undefined;

    if (intent.kind === "repo_tms") {
      const githubContextResolution = await resolveSlackRepoTmsGitHubContext({
        organizationId,
        text: message.text,
        connectorConfig,
        projectId,
        channelId: getSlackChannelId(thread, message),
        requirePullRequest: intent.githubContextRequirement === "pull_request",
      });

      if (githubContextResolution.status === "unresolved") {
        await removeEyesReaction(thread, message);
        wrapThreadPost(thread, interactionId);
        await thread.post({ markdown: githubContextResolution.followUp });
        return;
      }

      if (githubContextResolution.status === "resolved") {
        resolvedRepoTmsContext = githubContextResolution.context;
      }
    }

    if (intent.kind === "repo_tms") {
      const repoTmsWorkMode =
        membership.role === "owner" || membership.role === "admin" ? "write" : "read_only";
      const repoTmsTask: RepoTmsAgentTask = {
        id: randomUUID(),
        source: "slack",
        sourceThreadId: thread.id,
        actor: {
          sourceUserId: message.author.userId,
          userId: membership.localUserId,
          email: slackUser?.email,
          displayName: message.author.fullName ?? message.author.userName,
          role: membership.role,
        },
        organizationId,
        projectId,
        workMode: repoTmsWorkMode,
        instructions: message.text,
        githubContext: resolvedRepoTmsContext,
        createdAt: new Date().toISOString(),
        idempotencyKey: buildRepoTmsTaskIdempotencyKey({
          source: "slack",
          sourceThreadId: thread.id,
          organizationId,
          instructions: message.text,
          githubContext: resolvedRepoTmsContext,
        }),
      };
      await createRepoTmsAgentTaskQueue().enqueue(repoTmsTask);

      await removeEyesReaction(thread, message);
      wrapThreadPost(thread, interactionId);
      await thread.post({
        markdown:
          repoTmsWorkMode === "write"
            ? "Queued your repo/TMS workflow. I'll post progress and final results in this thread."
            : "Queued your read-only repo/TMS workflow. I'll gather context and post results in this thread.",
      });
      return;
    }

    const imageAttachments = getSlackImageAttachments(message);
    const fileAttachments = getSlackTranslationFileAttachments(message);
    const unsupportedFileAttachments = getUnsupportedSlackFileAttachments(message);
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

    const chatMessages = replaceLastUserMessage(
      await loadInteractionModelMessages(interactionId),
      persistedUserText,
    );

    if (imageAttachments.length > 0) {
      const imageIntentMessages = chatMessages.flatMap((chatMessage) => {
        if (
          (chatMessage.role !== "user" && chatMessage.role !== "assistant") ||
          typeof chatMessage.content !== "string"
        ) {
          return [];
        }
        return [{ role: chatMessage.role, content: chatMessage.content }];
      });

      await removeEyesReaction(thread, message);
      wrapThreadPost(thread, interactionId);
      await handleSlackImageAttachments(thread, message, {
        imageAttachments,
        conversationMessages: imageIntentMessages,
        beforePostGeneratedImage: async () => {
          await removeEyesReaction(thread, message);
        },
      });

      if (storedFileAttachments.length === 0) {
        return;
      }
    }

    const agent = createConversationToolLoopAgent({
      surface: "slack",
      toolContext: {
        conversationId: interactionId,
        organizationId,
        membershipRole: membership.role,
        projectId,
        db,
      },
      intent,
      additionalInstructions: additionalInstructions
        .filter((instruction): instruction is string => instruction !== null)
        .join("\n\n"),
    });
    const result = await agent.generate({ messages: chatMessages });

    await removeEyesReaction(thread, message);
    wrapThreadPost(thread, interactionId);
    const replyText = result.text.trim();
    if (replyText) {
      await thread.post({ markdown: replyText });
    }
  } catch {
    await removeEyesReaction(thread, message);
    wrapThreadPost(thread, interactionId);
    await thread.post({
      markdown:
        "I'm having trouble processing that right now. I can help with translation jobs, project questions, glossary lookups, and job status checks. How can I assist you?",
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
