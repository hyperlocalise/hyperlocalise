import type { GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import { env } from "@/lib/env";
import type { GitHubFixRequestedEventData, GitHubFixQueue } from "@/lib/workflow/types";

type HyperlocaliseFixCommand = {
  command: "fix";
  locale: string | null;
};

type GitHubBotOptions = {
  githubFixQueue: GitHubFixQueue;
};

type GitHubBotState = {
  lastFixEvent?: GitHubFixRequestedEventData;
};

let botInstance: Chat<{ github: ReturnType<typeof createGitHubAdapter> }, GitHubBotState> | null =
  null;
let botQueue: GitHubFixQueue | null = null;

function gitHubAppInstallationId(): number | undefined {
  if (!env.GITHUB_APP_INSTALLATION_ID) {
    return undefined;
  }

  const installationId = Number.parseInt(env.GITHUB_APP_INSTALLATION_ID, 10);
  return Number.isFinite(installationId) ? installationId : undefined;
}

function createStateAdapter() {
  return env.REDIS_URL ? createRedisState({ url: env.REDIS_URL }) : createMemoryState();
}

function parseFixCommand(text: string): HyperlocaliseFixCommand | null {
  const mentionIndex = text.toLowerCase().indexOf("@hyperlocalise");
  if (mentionIndex < 0) {
    return null;
  }
  const parts = text
    .slice(mentionIndex + "@hyperlocalise".length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts[0]?.toLowerCase() !== "fix") {
    return null;
  }

  return {
    command: "fix",
    locale: parts[1] ?? null,
  };
}

function splitRepository(fullName: string) {
  const [repositoryOwner, repositoryName] = fullName.split("/");
  if (!repositoryOwner || !repositoryName) {
    return null;
  }

  return { repositoryOwner, repositoryName };
}

function buildFixEvent(input: {
  raw: GitHubRawMessage;
  command: HyperlocaliseFixCommand;
  installationId: number;
}): GitHubFixRequestedEventData | null {
  const repo = splitRepository(input.raw.repository.full_name);
  if (!repo) {
    return null;
  }

  const base = {
    installationId: input.installationId,
    repositoryOwner: repo.repositoryOwner,
    repositoryName: repo.repositoryName,
    repositoryFullName: input.raw.repository.full_name,
    pullRequestNumber: input.raw.prNumber,
  };

  if (input.raw.type === "issue_comment") {
    if (input.raw.threadType === "issue") {
      return null;
    }

    return {
      ...base,
      trigger: {
        event: "issue_comment",
        action: "created",
        deliveryId: String(input.raw.comment.id),
        commentId: input.raw.comment.id,
      },
      scope: { type: "pull_request" },
    };
  }

  return {
    ...base,
    trigger: {
      event: "pull_request_review_comment",
      action: "created",
      deliveryId: String(input.raw.comment.id),
      commentId: input.raw.comment.id,
    },
    scope: {
      type: "review_comment",
      path: input.raw.comment.path,
      line: input.raw.comment.line ?? null,
      originalLine: input.raw.comment.original_line ?? null,
      side: input.raw.comment.side ?? null,
      commitSha: input.raw.comment.commit_id ?? input.raw.comment.original_commit_id ?? null,
      locale: input.command.locale,
    },
  };
}

async function handleMention(thread: Thread<GitHubBotState>, message: Message) {
  const queue = botQueue;
  if (!queue) {
    return;
  }

  const command = parseFixCommand(message.text);
  if (!command) {
    return;
  }
  const installationId = gitHubAppInstallationId();
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
        installationId: gitHubAppInstallationId(),
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
        userName: "hyperlocalise",
        webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
      }),
    },
    logger: "info",
    state: createStateAdapter(),
    userName: "hyperlocalise",
  });

  botInstance.onNewMention(handleMention);
  botInstance.onSubscribedMessage(async (thread, message) => {
    if (message.isMention) {
      await handleMention(thread, message);
    }
  });

  return botInstance;
}
