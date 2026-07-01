import type { ModelMessage } from "ai";

import type { HyperlocaliseAgentSurface } from "@/agents/hyperlocalise/agent/agent";
import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";
import type { RepositoryAgentTaskSource } from "@/lib/agent-contracts/repository-task";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  buildRepositoryGitHubContextInstructions,
  getOrganizationRepositoryConnectorConfig,
  resolveConversationRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import {
  createRepositorySandbox,
  stopRepositorySandbox,
} from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { supportedFileTranslationFileFormats } from "@/lib/translation/file-formats";
import { createLogger, serializeErrorForLog } from "@/lib/log";

import {
  classifyConversation,
  createConversationToolLoopAgent,
  getRecentUserConversationText,
  loadInteractionModelMessages,
  replaceLastUserMessage,
  shouldAttemptRepositoryContextResolution,
  shouldRequireRepositoryContextClarification,
  type ConversationClassification,
} from "./hyperlocalise-agent";
import { resolveOrganizationHasTmsIntegration } from "../skills/conversation-tms-integration";
import {
  getRepositoryContextKey,
  type ConversationRepositorySession,
} from "./conversation-repository-session";

const logger = createLogger("conversation-turn");

export function buildFileTranslationInstructions() {
  return `When a message includes stored source file IDs, create file translation jobs with type "file", the provided sourceFileId and fileFormat, targetLocales, and sourceLocale. Use sourceLocale "auto" if the user did not specify a source locale. Supported file job formats: ${supportedFileTranslationFileFormats.join(", ")}.`;
}

export function buildMissingRepositoryContextInstructions(followUp: string) {
  return [
    "Repository context is not available for this request.",
    `If the user asks where a string, message, copy, or localized text appears in code, ask this follow-up exactly: ${followUp}`,
    "Do not invent a GitHub repository, pull request, branch, installation ID, path, or file contents.",
  ].join("\n");
}

export function buildResolvedRepositoryContextInstructions(context: RepositoryAgentGitHubContext) {
  return [
    buildRepositoryGitHubContextInstructions(context),
    "Repository read tools are available for this request.",
    "Use grep with the user's literal string or copy, then read for surrounding lines when needed.",
    "Only explain where strings, messages, or copy appear and what nearby code implies.",
    "Do not modify files, upload sources, commit, push, or create jobs from repository context alone.",
  ].join("\n");
}

type ResolveRepositoryContextInput = {
  surface: HyperlocaliseAgentSurface;
  organizationId: string;
  projectId: string | null;
  conversationText: string;
  classification: ConversationClassification;
  repositorySession: ConversationRepositorySession | null;
  connectorConfig?: Record<string, unknown> | null;
  channelId?: string | null;
};

export type ResolvedRepositoryContext = {
  context: RepositoryAgentGitHubContext | null;
  instructions: string | null;
  clarificationFollowUp: string | null;
  updatedSession: ConversationRepositorySession | null;
};

export async function resolveConversationRepositoryContext(
  input: ResolveRepositoryContextInput,
): Promise<ResolvedRepositoryContext> {
  const storedRepositoryContext = input.repositorySession?.repositoryGitHubContext ?? null;
  const shouldResolve = shouldAttemptRepositoryContextResolution({
    classification: input.classification,
    storedRepositoryContext,
  });

  if (!shouldResolve) {
    return {
      context: null,
      instructions: null,
      clarificationFollowUp: null,
      updatedSession: input.repositorySession,
    };
  }

  const connectorConfig =
    input.connectorConfig ??
    (input.surface === "slack"
      ? await getOrganizationRepositoryConnectorConfig(input.organizationId)
      : null);

  const canReuseStoredRepositoryContext =
    storedRepositoryContext !== null && !input.classification.currentMessageSpecifiesRepository;

  if (canReuseStoredRepositoryContext) {
    return {
      context: storedRepositoryContext,
      instructions: buildResolvedRepositoryContextInstructions(storedRepositoryContext),
      clarificationFollowUp: null,
      updatedSession: input.repositorySession,
    };
  }

  const githubContextResolution = await resolveConversationRepositoryGitHubContext({
    organizationId: input.organizationId,
    text: input.conversationText,
    connectorConfig,
    projectId: input.projectId,
    channelId: input.channelId ?? null,
    requirePullRequest: input.classification.requiresPullRequest,
  });

  if (githubContextResolution.status === "resolved") {
    const context = githubContextResolution.context;
    return {
      context,
      instructions: buildResolvedRepositoryContextInstructions(context),
      clarificationFollowUp: null,
      updatedSession: {
        ...input.repositorySession,
        repositoryGitHubContext: context,
      },
    };
  }

  if (githubContextResolution.status === "unresolved") {
    if (storedRepositoryContext && !input.classification.currentMessageSpecifiesRepository) {
      return {
        context: storedRepositoryContext,
        instructions: buildResolvedRepositoryContextInstructions(storedRepositoryContext),
        clarificationFollowUp: null,
        updatedSession: input.repositorySession,
      };
    }

    const instructions = buildMissingRepositoryContextInstructions(
      githubContextResolution.followUp,
    );
    const clarificationFollowUp = shouldRequireRepositoryContextClarification(input.classification)
      ? githubContextResolution.followUp
      : null;

    return {
      context: null,
      instructions,
      clarificationFollowUp,
      updatedSession: input.repositorySession,
    };
  }

  return {
    context: null,
    instructions: null,
    clarificationFollowUp: null,
    updatedSession: input.repositorySession,
  };
}

export async function getOrCreateConversationRepositorySandbox(input: {
  conversationId: string;
  surface: HyperlocaliseAgentSurface;
  githubContext: RepositoryAgentGitHubContext;
  repositorySession: ConversationRepositorySession | null;
}): Promise<{
  sandboxId: string;
  updatedSession: ConversationRepositorySession;
  sandboxCreated: boolean;
  staleSandboxId: string | null;
}> {
  const log = logger.child({
    conversationId: input.conversationId,
    surface: input.surface,
  });
  const repositoryContextKey = getRepositoryContextKey(input.githubContext);
  const sandboxSession = input.repositorySession?.repositorySandboxSession;
  const now = new Date().toISOString();

  if (sandboxSession?.repositoryContextKey === repositoryContextKey) {
    log.info(
      { sandboxId: sandboxSession.sandboxId },
      "reusing stored repository sandbox for conversation agent",
    );
    return {
      sandboxId: sandboxSession.sandboxId,
      updatedSession: {
        ...input.repositorySession,
        repositoryGitHubContext: input.githubContext,
        repositorySandboxSession: {
          ...sandboxSession,
          lastUsedAt: now,
        },
      },
      sandboxCreated: false,
      staleSandboxId: null,
    };
  }

  log.info(
    {
      installationId: input.githubContext.installationId,
      branch: input.githubContext.branch ?? null,
      commitSha: input.githubContext.commitSha ?? null,
    },
    "creating repository sandbox for conversation agent",
  );
  const sandboxId = await createRepositorySandbox(input.githubContext);
  log.info({ sandboxId }, "repository sandbox created for conversation agent");

  const updatedSession: ConversationRepositorySession = {
    ...input.repositorySession,
    repositoryGitHubContext: input.githubContext,
    repositorySandboxSession: {
      sandboxId,
      repositoryContextKey,
      createdAt: now,
      lastUsedAt: now,
    },
  };

  const staleSandboxId = sandboxSession?.sandboxId ?? null;

  return { sandboxId, updatedSession, sandboxCreated: true, staleSandboxId };
}

export async function stopStaleRepositorySandbox(
  staleSandboxId: string | null | undefined,
  log = logger,
) {
  if (!staleSandboxId) {
    return;
  }

  await stopRepositorySandbox(staleSandboxId).catch((error: unknown) => {
    log.warn(
      { err: serializeErrorForLog(error), sandboxId: staleSandboxId },
      "stale repository sandbox cleanup failed",
    );
  });
}

export type PrepareConversationAgentTurnInput = {
  surface: HyperlocaliseAgentSurface;
  conversationId: string;
  organizationId: string;
  localUserId: string;
  membershipRole: OrganizationMembershipRole;
  projectId: string | null;
  messageText: string;
  hasTranslationAttachments: boolean;
  repositorySession?: ConversationRepositorySession | null;
  connectorConfig?: Record<string, unknown> | null;
  channelId?: string | null;
  repositorySource?: RepositoryAgentTaskSource;
  actor?: ToolContext["actor"];
  db: ToolContext["db"];
};

export type PrepareConversationAgentTurnResult = {
  classification: ConversationClassification;
  agent: ReturnType<typeof createConversationToolLoopAgent>;
  chatMessages: ModelMessage[];
  clarificationFollowUp: string | null;
  updatedRepositorySession: ConversationRepositorySession | null;
  staleSandboxId: string | null;
};

export async function prepareConversationAgentTurn(
  input: PrepareConversationAgentTurnInput,
): Promise<PrepareConversationAgentTurnResult> {
  const chatMessages = await loadInteractionModelMessages(input.conversationId);
  const conversationText = getRecentUserConversationText(chatMessages, input.messageText);
  const storedRepositoryContext = input.repositorySession?.repositoryGitHubContext ?? null;

  const classification = await classifyConversation({
    currentMessage: input.messageText,
    conversationText,
    hasFileAttachments: input.hasTranslationAttachments,
    hasStoredRepositoryContext: Boolean(storedRepositoryContext),
    surface: input.surface,
  });

  const repositoryResolution = await resolveConversationRepositoryContext({
    surface: input.surface,
    organizationId: input.organizationId,
    projectId: input.projectId,
    conversationText,
    classification,
    repositorySession: input.repositorySession ?? null,
    connectorConfig: input.connectorConfig,
    channelId: input.channelId,
  });

  let updatedRepositorySession = repositoryResolution.updatedSession;
  let sandboxId: string | null = null;
  let staleSandboxId: string | null = null;

  if (repositoryResolution.context) {
    const sandboxResult = await getOrCreateConversationRepositorySandbox({
      conversationId: input.conversationId,
      surface: input.surface,
      githubContext: repositoryResolution.context,
      repositorySession: updatedRepositorySession,
    });
    sandboxId = sandboxResult.sandboxId;
    updatedRepositorySession = sandboxResult.updatedSession;
    staleSandboxId = sandboxResult.staleSandboxId;
  }

  const hasTmsIntegration = await resolveOrganizationHasTmsIntegration(input.organizationId);

  const preparedMessages = replaceLastUserMessage(
    chatMessages,
    repositoryResolution.context
      ? getRecentUserConversationText(chatMessages, input.messageText)
      : input.messageText,
  );

  const agent = createConversationToolLoopAgent({
    surface: input.surface,
    toolContext: {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      localUserId: input.localUserId,
      membershipRole: input.membershipRole,
      projectId: input.projectId,
      db: input.db,
      ...(sandboxId
        ? {
            sandboxId,
            githubContext: repositoryResolution.context,
            workMode: "read_only" as const,
            repositorySource: input.repositorySource ?? "chat_ui",
            actor: input.actor,
          }
        : {}),
    },
    hasFileAttachments: input.hasTranslationAttachments,
    hasTmsIntegration,
    additionalInstructions: [buildFileTranslationInstructions(), repositoryResolution.instructions]
      .filter((instruction): instruction is string => instruction !== null)
      .join("\n\n"),
  });

  return {
    classification,
    agent,
    chatMessages: preparedMessages,
    clarificationFollowUp: repositoryResolution.clarificationFollowUp,
    updatedRepositorySession,
    staleSandboxId,
  };
}
