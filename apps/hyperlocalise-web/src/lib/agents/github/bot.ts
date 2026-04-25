import type { GitHubAdapter, GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import type { GitHubFixRequestedEventData, GitHubFixQueue } from "@/lib/workflow/types";

import { parseFixCommand } from "./commands";
import { buildFixEvent } from "./events";

type GitHubBotOptions = {
  githubFixQueue: GitHubFixQueue;
};

type GitHubBotState = {
  lastFixEvent?: GitHubFixRequestedEventData;
};

let botInstance: Chat<{ github: ReturnType<typeof createGitHubAdapter> }, GitHubBotState> | null =
  null;
let botQueue: GitHubFixQueue | null = null;

async function handleMention(thread: Thread<GitHubBotState>, message: Message) {
  const queue = botQueue;
  if (!queue) {
    return;
  }

  const command = parseFixCommand(message.text);
  if (!command) {
    return;
  }

  const installationId = await (thread.adapter as GitHubAdapter).getInstallationId(thread);
  if (!installationId) {
    await thread.post("GitHub App installation is not configured for `@hyperlocalise fix`.");
    return;
  }

  const event = buildFixEvent({
    raw: message.raw as GitHubRawMessage,
    command,
    installationId,
  });
  if (!event) {
    await thread.post(
      "I can only run `@hyperlocalise fix` from pull request comments or inline pull request review comments.",
    );
    return;
  }

  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);
  await thread.setState({ lastFixEvent: event });
  await queue.enqueue(event);
}

export async function getGitHubBot(options: GitHubBotOptions) {
  if (botInstance) {
    return botInstance;
  }
  botQueue = options.githubFixQueue;
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_WEBHOOK_SECRET) {
    throw new Error("missing GitHub App bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      github: createGitHubAdapter({
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
        userName: "hyperlocalise",
        webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
      }),
    },
    logger: "info",
    state: createChatStateAdapter(),
    userName: "hyperlocalise",
  });

  botInstance.onNewMention(handleMention);

  return botInstance;
}
