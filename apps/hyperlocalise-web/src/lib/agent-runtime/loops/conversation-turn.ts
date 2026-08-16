/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ModelMessage } from "ai";

import type {
  HyperlocaliseAgentSurface,
  HyperlocaliseAttachedProjectContext,
} from "@/agents/hyperlocalise/agent/agent";
import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";
import type { RepositoryAgentTaskSource } from "@/lib/agent-contracts/repository-task";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { and, eq } from "drizzle-orm";
import {
  buildRepositoryGitHubContextInstructions,
  getOrganizationRepositoryConnectorConfig,
  resolveConversationRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import {
  createRepositorySandbox,
  isRepositorySandboxAvailable,
  stopRepositorySandbox,
} from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
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
import { resolveWorkspaceVisualMockFlag } from "@/lib/flags/workspace-flags";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";

const logger = createLogger("conversation-turn");

export const REPOSITORY_ACCESS_CONTENTION_FOLLOW_UP =
  "I'm still preparing repository access for this conversation. Please send your message again in a moment.";

export function buildFileTranslationInstructions() {
  return [
    "When a message includes stored source file IDs, create file translation jobs with type \"file\", the provided sourceFileId and fileFormat, targetLocales, and sourceLocale.",
    'Use sourceLocale "auto" if the user did not specify a source locale.',
    `Supported file job formats: ${supportedFileTranslationFileFormats.join(", ")}.`,
    "For png, jpeg, webp, and mp4 attachments, still create a file translation job — the workflow localizes the image or video asset for each target locale.",
    "mp4 clips should typically be short (about 3–10 seconds).",
  ].join(" ");
}

/**
 * Build attached-project context when there is no local `projects` row.
 * Live CAT / TMS ids (`ext:crowdin:42`) encode the provider kind in the id.
 */
export function resolveVirtualAttachedProjectContext(
  projectId: string,
): HyperlocaliseAttachedProjectContext {
  const encodedProject = parseProviderProjectId(projectId);
  if (!encodedProject) {
    return { projectId };
  }

  return {
    projectId,
    projectSource: "external_tms",
    externalProviderKind: encodedProject.providerKind,
  };
}

async function loadAttachedProjectContext(input: {
  db: ToolContext["db"];
  organizationId: string;
  projectId: string | null;
}): Promise<HyperlocaliseAttachedProjectContext | null> {
  if (!input.projectId) {
    return null;
  }

  const [project] = await input.db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      source: schema.projects.source,
      externalProviderKind: schema.projects.externalProviderKind,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!project) {
    return resolveVirtualAttachedProjectContext(input.projectId);
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectSource: project.source,
    externalProviderKind: project.externalProviderKind,
  };
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
    const clarificationFollowUp = shouldRequireRepositoryContextClarification(
      input.classification,
      { repositoryContextStatus: githubContextResolution.status },
    )
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

  if (
    sandboxSession?.repositoryContextKey === repositoryContextKey &&
    (await isRepositorySandboxAvailable(sandboxSession.sandboxId))
  ) {
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
  knowledgeMemoryEnabled?: boolean;
  glossarySearchEnabled?: boolean;
  repositorySession?: ConversationRepositorySession | null;
  connectorConfig?: Record<string, unknown> | null;
  channelId?: string | null;
  repositorySource?: RepositoryAgentTaskSource;
  actor?: ToolContext["actor"];
  reportToolProgress?: ToolContext["reportToolProgress"];
  db: ToolContext["db"];
  reuseCommittedRepositorySandboxOnly?: boolean;
};

export type PrepareConversationAgentTurnResult = {
  classification: ConversationClassification;
  agent: Awaited<ReturnType<typeof createConversationToolLoopAgent>>;
  chatMessages: ModelMessage[];
  clarificationFollowUp: string | null;
  updatedRepositorySession: ConversationRepositorySession | null;
  staleSandboxId: string | null;
  repositorySandboxId: string | null;
};

function resolveConversationActor(input: PrepareConversationAgentTurnInput): ToolContext["actor"] {
  return (
    input.actor ?? {
      sourceUserId: input.localUserId,
      userId: input.localUserId,
      role: input.membershipRole,
    }
  );
}

export async function prepareConversationAgentTurn(
  input: PrepareConversationAgentTurnInput,
): Promise<PrepareConversationAgentTurnResult> {
  const chatMessages = await loadInteractionModelMessages(input.conversationId);
  const conversationText = getRecentUserConversationText(chatMessages, input.messageText);
  const storedRepositoryContext = input.repositorySession?.repositoryGitHubContext ?? null;
  const languageModel = await resolveHyperlocaliseAgentLanguageModel({
    organizationId: input.organizationId,
  });

  const classification = await classifyConversation({
    currentMessage: input.messageText,
    conversationText,
    hasFileAttachments: input.hasTranslationAttachments,
    hasStoredRepositoryContext: Boolean(storedRepositoryContext),
    knowledgeMemoryEnabled: input.knowledgeMemoryEnabled === true,
    surface: input.surface,
    model: languageModel.model,
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
  let activeRepositoryContext = repositoryResolution.context;
  let repositoryInstructions = repositoryResolution.instructions;
  let clarificationFollowUp = repositoryResolution.clarificationFollowUp;

  if (repositoryResolution.context) {
    const repositoryContextKey = getRepositoryContextKey(repositoryResolution.context);
    const storedSandboxSession = updatedRepositorySession?.repositorySandboxSession;
    const canReuseStoredSandbox =
      storedSandboxSession?.repositoryContextKey === repositoryContextKey;

    if (input.reuseCommittedRepositorySandboxOnly && !canReuseStoredSandbox) {
      updatedRepositorySession = input.repositorySession ?? null;
      activeRepositoryContext = null;
      repositoryInstructions = null;
      clarificationFollowUp = REPOSITORY_ACCESS_CONTENTION_FOLLOW_UP;
    } else {
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
  }

  const [hasTmsIntegration, hasVisualMockSkill, attachedProject] = await Promise.all([
    resolveOrganizationHasTmsIntegration(input.organizationId),
    resolveWorkspaceVisualMockFlag({
      organizationId: input.organizationId,
      localUserId: input.localUserId,
      dbClient: input.db,
    }),
    loadAttachedProjectContext({
      db: input.db,
      organizationId: input.organizationId,
      projectId: input.projectId,
    }),
  ]);

  const preparedMessages = replaceLastUserMessage(chatMessages, input.messageText);

  const agent = await createConversationToolLoopAgent({
    surface: input.surface,
    toolContext: {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      localUserId: input.localUserId,
      membershipRole: input.membershipRole,
      projectId: input.projectId,
      db: input.db,
      reportToolProgress: input.reportToolProgress,
      knowledgeMemoryEnabled: input.knowledgeMemoryEnabled === true,
      glossarySearchEnabled: input.glossarySearchEnabled === true,
      ...(sandboxId
        ? {
            sandboxId,
            githubContext: activeRepositoryContext,
            workMode: hasVisualMockSkill ? ("write" as const) : ("read_only" as const),
            repositorySource: input.repositorySource ?? "chat_ui",
            actor: resolveConversationActor(input),
          }
        : {}),
    },
    hasFileAttachments: input.hasTranslationAttachments,
    hasTmsIntegration,
    hasVisualMockSkill,
    attachedProject,
    additionalInstructions: [buildFileTranslationInstructions(), repositoryInstructions]
      .filter((instruction): instruction is string => instruction !== null)
      .join("\n\n"),
    languageModel,
  });

  return {
    classification,
    agent,
    chatMessages: preparedMessages,
    clarificationFollowUp,
    updatedRepositorySession,
    staleSandboxId,
    repositorySandboxId: sandboxId,
  };
}
