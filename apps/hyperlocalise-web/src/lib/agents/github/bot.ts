import type { GitHubAdapter, GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import {
  createHyperlocaliseAgent,
  loadInteractionModelMessages,
} from "@/lib/agents/hyperlocalise-agent";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { wrapThreadPostForInteraction } from "@/lib/agents/runtime/tracking";
import { env } from "@/lib/env";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";
import type { GitHubFixRequestedEventData, GitHubFixQueue } from "@/lib/workflow/types";

import { parseFixCommand } from "./commands";
import { buildFixEvent } from "./events";
import { requesterCanRunFix } from "./permissions";
import { createGitHubFixTools } from "./tools";

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

function buildGitHubFixInstructions(event: GitHubFixRequestedEventData) {
  return [
    "The GitHub command router already validated this request.",
    "Call enqueueGitHubFix exactly once before replying.",
    "After the tool succeeds, tell the user the fix workflow has been queued.",
    "If the tool returns alreadyQueued, tell the user this fix request is already queued.",
    "",
    `Repository: ${event.repositoryFullName}`,
    `Pull request: #${event.pullRequestNumber}`,
    `Scope: ${event.scope.type}`,
  ].join("\n");
}

export async function handleMention(
  thread: Thread<GitHubBotState>,
  message: Message,
  options: { queue?: GitHubFixQueue } = {},
) {
  const queue = options.queue ?? botQueue;
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
    requesterLogin: message.author.userId,
  });
  if (!event) {
    await thread.post(
      "I can only run `@hyperlocalise fix` from pull request comments or inline pull request review comments.",
    );
    return;
  }

  if (!(await requesterCanRunFix(event))) {
    await thread.post(
      "I can only run `@hyperlocalise fix` for repository collaborators with write access.",
    );
    return;
  }

  // Conversation tracking
  let conversationId: string | undefined;
  try {
    const organizationId = await getOrganizationIdByInstallationId(githubInstallationId);
    if (organizationId) {
      const existing = await findInteractionBySourceThreadId({
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
        const created = await createInteraction({
          organizationId,
          source: "github_agent",
          title,
          sourceThreadId: thread.id,
        });
        conversationId = created.id;
      }
      await addInteractionMessage({
        interactionId: conversationId,
        senderType: "user",
        text: message.text,
      });

      wrapThreadPostForInteraction(thread, conversationId);
    }
  } catch {
    // Best-effort tracking
  }

  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);
  await thread.setState({ lastFixEvent: event });

  const tools = createGitHubFixTools({ event, queue });
  const agent = createHyperlocaliseAgent({
    surface: "github",
    projectId: null,
    tools,
    activeTools: ["enqueueGitHubFix"],
    additionalInstructions: buildGitHubFixInstructions(event),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          activeTools: ["enqueueGitHubFix"],
          toolChoice: { type: "tool", toolName: "enqueueGitHubFix" },
        };
      }

      return {
        toolChoice: "none",
      };
    },
  });
  const messages = conversationId
    ? await loadInteractionModelMessages(conversationId)
    : [{ role: "user" as const, content: message.text }];
  const result = await agent.generate({ messages });

  if (result.text.trim()) {
    await thread.post(result.text);
  }
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

  botInstance.onNewMention((thread, message) => handleMention(thread, message));

  return botInstance;
}
