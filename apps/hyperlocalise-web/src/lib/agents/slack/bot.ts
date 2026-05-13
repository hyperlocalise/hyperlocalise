import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread, UserInfo } from "chat";

import {
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
  replaceLastUserMessage,
} from "@/lib/agents/hyperlocalise-agent";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { wrapThreadPostForInteraction } from "@/lib/agents/runtime/tracking";
import { db } from "@/lib/database";
import { env } from "@/lib/env";
import { createChatLogger } from "@/lib/log";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";

import { findSlackConnector, lookupMembership } from "./helpers";

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

async function processSlackMessage(
  thread: Thread<SlackBotState>,
  message: Message,
  interactionId: string,
  organizationId: string,
  projectId: string | null,
) {
  try {
    const chatMessages = replaceLastUserMessage(
      await loadInteractionModelMessages(interactionId),
      message.text,
    );

    const slackUser = await getSlackUser(thread, message.author.userId);
    const membership = slackUser?.email
      ? await lookupMembership({ email: slackUser.email, organizationId })
      : null;

    if (!membership) {
      wrapThreadPost(thread, interactionId);
      await thread.post(
        "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
      );
      return;
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
    });
    const result = await agent.generate({ messages: chatMessages });

    wrapThreadPost(thread, interactionId);
    if (result.text.trim()) {
      await thread.post(result.text);
    }
  } catch {
    wrapThreadPost(thread, interactionId);
    await thread.post(
      "I'm having trouble processing that right now. I can help with translation jobs, project questions, glossary lookups, and job status checks. How can I assist you?",
    );
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

  const slackUser = await getSlackUser(thread, message.author.userId);

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
    senderEmail: slackUser?.email,
  });

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

  const slackUser = await getSlackUser(thread, message.author.userId);

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
    senderEmail: slackUser?.email,
  });

  await processSlackMessage(
    thread,
    message,
    interaction.id,
    connector.organizationId,
    interaction.projectId,
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
