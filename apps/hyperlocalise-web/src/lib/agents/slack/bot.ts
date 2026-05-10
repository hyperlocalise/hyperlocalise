import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import { createChatLogger } from "@/lib/log";

let botInstance: Chat<
  { slack: ReturnType<typeof createSlackAdapter> },
  Record<string, unknown>
> | null = null;

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

  // Placeholder handlers — business logic will be wired in follow-up tickets.
  // Both handlers below are stubs and must be replaced before going to production.
  botInstance.onNewMention(async (thread) => {
    await thread.subscribe();
    await thread.post("Hello! I'm the Hyperlocalise agent. How can I help?");
  });

  botInstance.onSubscribedMessage(async (thread, message) => {
    await thread.post(`You said: ${message.text}`);
  });

  return botInstance;
}
