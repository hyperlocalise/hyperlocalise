import type { GitHubAdapter, GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import {
  createHyperlocaliseAgent,
  loadInteractionModelMessages,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { wrapThreadPostForInteraction } from "@/lib/agent-runtime/runs/agent-run-events";
import {
  buildRepositoryGitHubContextInstructions,
  resolveGitHubRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import { env } from "@/lib/env";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";
import type {
  GitHubFixRequestedEventData,
  GitHubFixQueue,
  RepositoryAgentTaskQueue,
} from "@/lib/workflow/types";

import { getGitHubAppPrivateKey } from "./app";
import { parseHyperlocaliseCommand } from "./commands";
import { buildFixEvent } from "./events";
import { requesterCanRunFix } from "./permissions";
import { createGitHubFixTools } from "./tools";
import { createRepositoryAgentTaskQueue } from "@/workflows/adapters";
import { buildRepositoryTaskIdempotencyKey } from "@/lib/agents/repository-agent-task";
import { randomUUID } from "node:crypto";
import {
  buildGitHubRepositoryRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
  releaseGitHubAgentRequestClaim,
} from "./request-idempotency";

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

  const command = parseHyperlocaliseCommand(message.text);
  if (!command) {
    return;
  }

  const installationId = await (thread.adapter as GitHubAdapter).getInstallationId(thread);
  if (!installationId) {
    await thread.post("GitHub App installation is not configured for `@hyperlocalise`.");
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
      "I can only run `@hyperlocalise` from pull request comments or inline pull request review comments.",
    );
    return;
  }

  if (!(await requesterCanRunFix(event))) {
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

  // Conversation tracking
  let conversationId: string | undefined;
  try {
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

  if (command.command === "repository") {
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
          installationId: event.installationId,
          repositoryFullName: event.repositoryFullName,
          pullRequestNumber: event.pullRequestNumber,
          commentId: event.trigger.commentId,
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
        githubContext: githubContext,
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
        "Queued your repository workflow. I will post progress and completion updates on this pull request.",
      );
    } catch (error) {
      await releaseGitHubAgentRequestClaim(claim.requestId);
      await thread.post(
        "I could not queue this repository workflow right now. Please try again in a moment.",
      );
      throw error;
    }
    return;
  }

  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);
  await thread.setState({ lastFixEvent: event });

  const tools = createGitHubFixTools({ event, queue });
  const agent = createHyperlocaliseAgent({
    surface: "github",
    projectId: null,
    tools,
    activeTools: ["enqueueGitHubFix"],
    additionalInstructions: [
      buildGitHubFixInstructions(event),
      githubContextResolution.status === "resolved"
        ? buildRepositoryGitHubContextInstructions(githubContextResolution.context)
        : null,
    ]
      .filter((instruction): instruction is string => instruction !== null)
      .join("\n\n"),
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
