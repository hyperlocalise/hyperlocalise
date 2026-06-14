import type { GitHubAdapter, GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";
import { randomUUID } from "node:crypto";

import { wrapThreadPostForInteraction } from "@/lib/agent-runtime/runs/agent-run-events";
import {
  buildRepositoryGitHubContextInstructions,
  resolveGitHubRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import { buildRepositoryTaskIdempotencyKey } from "@/lib/agents/repository-agent-task";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/conversations/interactions";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import type { RepositoryAgentTaskQueue } from "@/lib/workflow/types";
import { eq } from "drizzle-orm";
import { createRepositoryAgentTaskQueue } from "@/workflows/adapters";

import { getGitHubAppPrivateKey } from "./app";
import { parseHyperlocaliseCommand } from "./commands";
import { buildGitHubMentionContext } from "./events";
import { requesterCanRunGitHubCommand } from "./permissions";
import {
  buildGitHubRepositoryRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
  releaseGitHubAgentRequestClaim,
} from "./request-idempotency";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";

let botInstance: Chat<
  { github: ReturnType<typeof createGitHubAdapter> },
  Record<string, never>
> | null = null;

async function getOrganizationIdByInstallationId(installationId: string) {
  const [installation] = await db
    .select({ organizationId: schema.githubInstallations.organizationId })
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.githubInstallationId, installationId))
    .limit(1);
  return installation?.organizationId ?? null;
}

export async function handleMention(thread: Thread<Record<string, never>>, message: Message) {
  const command = parseHyperlocaliseCommand(message.text);
  if (!command) {
    return;
  }

  if (command.command === "unsupported_fix") {
    await thread.post(
      "The `@hyperlocalise fix` command is not available right now. Use `@hyperlocalise` with instructions to run a read-only repository workflow instead.",
    );
    return;
  }

  const installationId = await (thread.adapter as GitHubAdapter).getInstallationId(thread);
  if (!installationId) {
    await thread.post("GitHub App installation is not configured for `@hyperlocalise`.");
    return;
  }
  const githubInstallationId = String(installationId);

  const mentionContext = buildGitHubMentionContext({
    raw: message.raw as GitHubRawMessage,
    installationId: Number.parseInt(githubInstallationId, 10),
  });
  if (!mentionContext) {
    await thread.post(
      "I can only run `@hyperlocalise` from pull request comments or inline pull request review comments.",
    );
    return;
  }

  if (
    !(await requesterCanRunGitHubCommand({
      installationId: mentionContext.installationId,
      repositoryOwner: mentionContext.repositoryOwner,
      repositoryName: mentionContext.repositoryName,
      requesterLogin: message.author.userId,
    }))
  ) {
    await thread.post(
      "I can only run `@hyperlocalise` commands for repository collaborators with write access.",
    );
    return;
  }

  const githubContextResolution = await resolveGitHubRepositoryGitHubContext({
    raw: message.raw as GitHubRawMessage,
    installationId: Number.parseInt(githubInstallationId, 10),
  });
  if (githubContextResolution.status === "unresolved") {
    await thread.post(githubContextResolution.followUp);
    return;
  }

  const organizationId = await getOrganizationIdByInstallationId(githubInstallationId);

  try {
    if (organizationId) {
      const existing = await findInteractionBySourceThreadId({
        organizationId,
        source: "github_agent",
        sourceThreadId: thread.id,
      });
      let conversationId = existing?.id;
      if (!conversationId) {
        const raw = message.raw as GitHubRawMessage;
        const title = raw?.repository?.full_name
          ? `${raw.repository.full_name}#${raw.prNumber ?? ""}`
          : "GitHub repository request";
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

  if (githubContextResolution.status !== "resolved") {
    await thread.post(
      "I need a pull request context for this GitHub request. Please run the command from a PR comment or an inline PR review comment.",
    );
    return;
  }
  if (!organizationId) {
    await thread.post(
      "I could not resolve the Hyperlocalise workspace for this GitHub installation.",
    );
    return;
  }

  const taskQueue: RepositoryAgentTaskQueue = createRepositoryAgentTaskQueue();
  const githubContext = githubContextResolution.context;
  let claim: Awaited<ReturnType<typeof claimGitHubAgentRequest>>;
  try {
    claim = await claimGitHubAgentRequest(
      buildGitHubRepositoryRequestInput({
        installationId: mentionContext.installationId,
        repositoryFullName: mentionContext.repositoryFullName,
        pullRequestNumber: mentionContext.pullRequestNumber,
        commentId: mentionContext.commentId,
        instructions: command.instructions,
      }),
    );
  } catch (error) {
    await thread.post(
      "I could not queue this repository workflow right now. Please try again in a moment.",
    );
    throw error;
  }
  if (claim.alreadyQueued) {
    await thread.post("This repository request is already queued.");
    return;
  }

  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);
  try {
    const result = await taskQueue.enqueue({
      id: randomUUID(),
      source: "github",
      sourceThreadId: thread.id,
      actor: {
        sourceUserId: message.author.userId,
        displayName: message.author.fullName ?? message.author.userName,
      },
      organizationId,
      projectId: null,
      workMode: "read_only",
      instructions: command.instructions,
      githubContext,
      createdAt: new Date().toISOString(),
      idempotencyKey: buildRepositoryTaskIdempotencyKey({
        source: "github",
        sourceThreadId: thread.id,
        organizationId,
        instructions: command.instructions,
        githubContext,
      }),
    });
    await markGitHubAgentRequestEnqueued({
      requestId: claim.requestId,
      workflowRunIds: result.ids,
    });
    await thread.post(
      [
        "Queued your repository workflow. I will post progress and completion updates on this pull request.",
        buildRepositoryGitHubContextInstructions(githubContext),
      ].join("\n\n"),
    );
  } catch (error) {
    await releaseGitHubAgentRequestClaim(claim.requestId);
    await thread.post(
      "I could not queue this repository workflow right now. Please try again in a moment.",
    );
    throw error;
  }
}

export async function getGitHubBot() {
  if (botInstance) {
    return botInstance;
  }
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_WEBHOOK_SECRET) {
    throw new Error("missing GitHub App bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      github: createGitHubAdapter({
        appId: env.GITHUB_APP_ID,
        privateKey: getGitHubAppPrivateKey(),
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
