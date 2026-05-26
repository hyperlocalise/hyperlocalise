import { Chat, emoji } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread, UserInfo } from "chat";

import {
  classifyConversationMode,
  conversationModeRequiresPullRequestContext,
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
  replaceLastUserMessage,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import {
  buildRepositoryGitHubContextInstructions,
  resolveSlackRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import {
  createRepositorySandbox,
  stopRepositorySandbox,
} from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { type RepositoryAgentGitHubContext } from "@/lib/agents/repository-agent-task";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { wrapThreadPostForInteraction } from "@/lib/agent-runtime/runs/agent-run-events";
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

function buildSlackRepositoryInstructions(
  messages: Awaited<ReturnType<typeof loadInteractionModelMessages>>,
  latestText: string,
): string {
  const userLines = messages.flatMap((chatMessage) => {
    if (chatMessage.role !== "user" || typeof chatMessage.content !== "string") {
      return [];
    }

    const text = chatMessage.content.trim();
    return text ? [text] : [];
  });

  const trimmedLatest = latestText.trim();
  if (trimmedLatest && userLines.at(-1) !== trimmedLatest) {
    userLines.push(trimmedLatest);
  }

  if (userLines.length === 0) {
    return trimmedLatest;
  }

  return userLines.slice(-5).join("\n");
}

function getSlackChannelId(thread: Thread<SlackBotState>, message: Message): string | null {
  const channelId = thread.channelId;
  if (typeof channelId === "string" && channelId.length > 0) {
    return channelId;
  }

  const raw = message.raw as { channel?: string } | undefined;
  return raw?.channel ?? null;
}

const githubReferencePattern =
  /https?:\/\/(?:www\.)?github\.com\/[^\s]+|\b(?:github|repo|repository)\b|(?:^|[\s(<])[\w.-]+\/[\w.-]+(?=[\s>|)\].,;:!?]|$)/i;
const repositoryContextQuestionPattern =
  /\b(?:context|search|find(?:ing)?|locate|lookup|where|usage|surrounding|nearby)\b/i;
const repositoryStringSubjectPattern =
  /\b(?:locali[sz]ed|translated|message|messages|string|strings|copy|text)\b/i;

function shouldAttemptRepositoryContextResolution(input: {
  text: string;
  hasStoredFileAttachments: boolean;
  mode: ReturnType<typeof classifyConversationMode>;
}) {
  if (input.mode === "repository") {
    return true;
  }

  if (!input.hasStoredFileAttachments) {
    return githubReferencePattern.test(input.text);
  }

  return githubReferencePattern.test(input.text);
}

function shouldRequireRepositoryContextClarification(text: string) {
  return (
    githubReferencePattern.test(text) ||
    (repositoryContextQuestionPattern.test(text) &&
      (repositoryStringSubjectPattern.test(text) || /["'`][^"'`]+["'`]/.test(text)))
  );
}

function buildMissingRepositoryContextInstructions(followUp: string) {
  return [
    "Repository context is not available for this request.",
    `If the user asks where a string, message, copy, or localized text appears in code, ask this follow-up exactly: ${followUp}`,
    "Do not invent a GitHub repository, pull request, branch, installation ID, path, or file contents.",
  ].join("\n");
}

function buildResolvedRepositoryContextInstructions(context: RepositoryAgentGitHubContext) {
  return [
    buildRepositoryGitHubContextInstructions(context),
    "Repository read tools are available for this request.",
    "Use grep with the user's literal string or copy, then read for surrounding lines when needed.",
    "Only explain where strings, messages, or copy appear and what nearby code implies.",
    "Do not modify files, upload sources, commit, push, or create jobs from repository context alone.",
  ].join("\n");
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

    const conversationMode = classifyConversationMode(message.text);

    let resolvedRepositoryContext: RepositoryAgentGitHubContext | null = null;
    let repositoryContextInstructions: string | null = null;
    if (
      shouldAttemptRepositoryContextResolution({
        text: message.text,
        hasStoredFileAttachments: storedFileAttachments.length > 0,
        mode: conversationMode,
      })
    ) {
      const githubContextResolution = await resolveSlackRepositoryGitHubContext({
        organizationId,
        text: message.text,
        connectorConfig,
        projectId,
        channelId: getSlackChannelId(thread, message),
        requirePullRequest: conversationModeRequiresPullRequestContext(
          message.text,
          conversationMode,
        ),
      });

      if (githubContextResolution.status === "resolved") {
        resolvedRepositoryContext = githubContextResolution.context;
        repositoryContextInstructions =
          buildResolvedRepositoryContextInstructions(resolvedRepositoryContext);
      } else if (githubContextResolution.status === "unresolved") {
        repositoryContextInstructions = buildMissingRepositoryContextInstructions(
          githubContextResolution.followUp,
        );

        if (shouldRequireRepositoryContextClarification(message.text)) {
          await removeEyesReaction(thread, message);
          wrapThreadPost(thread, interactionId);
          await thread.post({ markdown: githubContextResolution.followUp });
          return;
        }
      }
    }

    const loadedMessages = await loadInteractionModelMessages(interactionId);
    const chatMessages = replaceLastUserMessage(
      loadedMessages,
      resolvedRepositoryContext
        ? buildSlackRepositoryInstructions(loadedMessages, persistedUserText)
        : persistedUserText,
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

    let sandboxId: string | null = null;
    try {
      if (resolvedRepositoryContext) {
        sandboxId = await createRepositorySandbox(resolvedRepositoryContext);
      }

      const agent = createConversationToolLoopAgent({
        surface: "slack",
        userMessageText: persistedUserText,
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
        hasFileAttachments: storedFileAttachments.length > 0,
        additionalInstructions: [
          buildSlackFileTranslationInstructions(),
          repositoryContextInstructions,
        ]
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
    } finally {
      if (sandboxId) {
        await stopRepositorySandbox(sandboxId).catch(() => {
          // Best-effort cleanup
        });
      }
    }
  } catch {
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
