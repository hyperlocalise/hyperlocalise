import { Chat, type Adapter } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";

type SlackChat = Chat<{ slack: Adapter<unknown, unknown> }>;

let slackChatPromise: Promise<SlackChat> | null = null;

async function getSlackChat(): Promise<SlackChat> {
  if (slackChatPromise) {
    return slackChatPromise;
  }

  slackChatPromise = initializeSlackChat().catch((error: unknown) => {
    slackChatPromise = null;
    throw error;
  });
  return slackChatPromise;
}

async function initializeSlackChat(): Promise<SlackChat> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_SIGNING_SECRET) {
    throw new Error("missing Slack bot configuration");
  }

  const { createSlackAdapter } = await import("@chat-adapter/slack");

  const slackChat = new Chat({
    adapters: {
      slack: createSlackAdapter({
        clientId: env.SLACK_CLIENT_ID,
        clientSecret: env.SLACK_CLIENT_SECRET,
        signingSecret: env.SLACK_SIGNING_SECRET,
        userName: "hyperlocalise",
      }),
    },
    state: createChatStateAdapter(),
    userName: "hyperlocalise",
  });

  await slackChat.initialize();
  return slackChat;
}

export async function postSlackChannelMessage(input: {
  channelId: string;
  text: string;
}): Promise<void> {
  const chat = await getSlackChat();
  const adapter = chat.getAdapter("slack") as {
    postChannelMessage: (channelId: string, message: string) => Promise<unknown>;
  };
  const channelId = input.channelId.startsWith("slack:")
    ? input.channelId
    : `slack:${input.channelId}`;
  await adapter.postChannelMessage(channelId, input.text);
}
