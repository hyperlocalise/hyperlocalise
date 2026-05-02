import type { GitHubAdapter, GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { env } from "@/lib/env";
import {
  addConversationMessage,
  createConversation,
  findConversationBySourceThreadId,
} from "@/lib/conversations";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";
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

async function getOrganizationIdByInstallationId(installationId: string) {
  const [installation] = await db
    .select({ organizationId: schema.githubInstallations.organizationId })
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.githubInstallationId, installationId))
    .limit(1);
  return installation?.organizationId ?? null;
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

  const installationId = await (thread.adapter as GitHubAdapter).getInstallationId(thread);
  if (!installationId) {
    await thread.post("GitHub App installation is not configured for `@hyperlocalise fix`.");
    return;
  }
  const githubInstallationId = String(installationId);

  const event = buildFixEvent({
    raw: message.raw as GitHubRawMessage,
    command,
    installationId: Number.parseInt(githubInstallationId, 10),
  });
  if (!event) {
    await thread.post(
      "I can only run `@hyperlocalise fix` from pull request comments or inline pull request review comments.",
    );
    return;
  }

  // Conversation tracking
  let conversationId: string | undefined;
  try {
    const organizationId = await getOrganizationIdByInstallationId(githubInstallationId);
    if (organizationId) {
      const existing = await findConversationBySourceThreadId({
        organizationId,
        source: "github_agent",
        sourceThreadId: thread.id,
      });
      if (existing) {
        conversationId = existing.id;
      } else {
        const raw = message.raw as GitHubRawMessage;
        const title = raw?.repository?.full_name
          ? `${raw.repository.full_name}#${raw.prNumber ?? ""}`
          : "GitHub fix request";
        const created = await createConversation({
          organizationId,
          source: "github_agent",
          title,
          sourceThreadId: thread.id,
        });
        conversationId = created.id;
      }
      await addConversationMessage({
        conversationId,
        senderType: "user",
        text: message.text,
      });

      // Wrap thread.post to track agent replies
      const originalPost = thread.post.bind(thread);
      (thread as { post: typeof originalPost }).post = async (
        ...args: Parameters<typeof originalPost>
      ) => {
        const result = await originalPost(...args);
        try {
          const text = typeof args[0] === "string" ? args[0] : "";
          if (text) {
            await addConversationMessage({
              conversationId: conversationId!,
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
  } catch {
    // Best-effort tracking
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
