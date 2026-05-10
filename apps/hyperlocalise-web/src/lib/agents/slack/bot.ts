import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import { createChatLogger } from "@/lib/log";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";

import { findSlackConnector } from "./helpers";

type SlackBotState = Record<string, unknown>;

let botInstance: Chat<{ slack: ReturnType<typeof createSlackAdapter> }, SlackBotState> | null =
  null;

export function extractTeamId(message: Message): string | null {
  const raw = message.raw as { team_id?: string; team?: string } | undefined;
  return raw?.team_id ?? raw?.team ?? null;
}

export async function wrapThreadPost(thread: Thread<SlackBotState>, interactionId: string) {
  const originalPost = thread.post.bind(thread);
  thread.post = async (...args: Parameters<typeof originalPost>) => {
    const result = await originalPost(...args);
    try {
      const content = args[0];
      const text = typeof content === "string" ? content : "";
      if (text) {
        await addInteractionMessage({
          interactionId,
          senderType: "agent",
          text,
        });
      }
    } catch {
      // Best-effort tracking
    }
    return result;
  };
}

export async function getOrCreateInteraction(
  organizationId: string,
  threadId: string,
  title: string,
) {
  const existing = await findInteractionBySourceThreadId({
    organizationId,
    source: "slack_agent",
    sourceThreadId: threadId,
  });
  if (existing) {
    return existing;
  }
  return createInteraction({
    organizationId,
    source: "slack_agent",
    title,
    sourceThreadId: threadId,
  });
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

  const interaction = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
  });

  await wrapThreadPost(thread, interaction.id);

  await thread.subscribe();

  await thread.post("Hello! I'm the Hyperlocalise agent. How can I help?");
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

  const interaction = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
  });

  await wrapThreadPost(thread, interaction.id);

  await thread.post(`You said: ${message.text}`);
}

export async function getSlackBot() {
  if (botInstance) {
    return botInstance;
  }

  if (!env.SLACK_BOT_TOKEN || !env.SLACK_SIGNING_SECRET) {
    throw new Error("missing Slack bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      slack: createSlackAdapter({
        botToken: env.SLACK_BOT_TOKEN,
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
