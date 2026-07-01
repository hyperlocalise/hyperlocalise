import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";
import { stopRepositorySandbox } from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { createLogger, serializeErrorForLog } from "@/lib/log";

const logger = createLogger("conversation-repository-session");

export type ConversationRepositorySandboxSession = {
  sandboxId: string;
  repositoryContextKey: string;
  createdAt: string;
  lastUsedAt: string;
};

export type ConversationRepositorySession = {
  repositoryGitHubContext?: RepositoryAgentGitHubContext;
  repositorySandboxSession?: ConversationRepositorySandboxSession;
};

export function getRepositoryContextKey(context: RepositoryAgentGitHubContext): string {
  return JSON.stringify({
    installationId: context.installationId,
    repositoryFullName: context.repositoryFullName,
    pullRequestNumber: context.pullRequestNumber ?? null,
    branch: context.branch ?? null,
    commitSha: context.commitSha ?? null,
    commentId: context.commentId ?? null,
  });
}

const WEB_SESSION_TTL_MS = 30 * 60 * 1000;
const WEB_SESSION_MAX_ENTRIES = 200;

type WebSessionEntry = {
  session: ConversationRepositorySession;
  expiresAt: number;
};

const webRepositorySessions = new Map<string, WebSessionEntry>();

function releaseWebSessionSandbox(session: ConversationRepositorySession) {
  const sandboxId = session.repositorySandboxSession?.sandboxId;
  if (!sandboxId) {
    return;
  }

  void stopRepositorySandbox(sandboxId).catch((error: unknown) => {
    logger.warn(
      { err: serializeErrorForLog(error), sandboxId },
      "web repository sandbox cleanup failed during session eviction",
    );
  });
}

function removeWebRepositorySession(conversationId: string) {
  const entry = webRepositorySessions.get(conversationId);
  if (!entry) {
    return;
  }

  releaseWebSessionSandbox(entry.session);
  webRepositorySessions.delete(conversationId);
}

function pruneExpiredWebSessions(now: number) {
  for (const [conversationId, entry] of webRepositorySessions) {
    if (entry.expiresAt <= now) {
      removeWebRepositorySession(conversationId);
    }
  }

  while (webRepositorySessions.size > WEB_SESSION_MAX_ENTRIES) {
    const oldestConversationId = webRepositorySessions.keys().next().value;
    if (!oldestConversationId) {
      break;
    }
    removeWebRepositorySession(oldestConversationId);
  }
}

export function getWebConversationRepositorySession(
  conversationId: string,
): ConversationRepositorySession | null {
  const now = Date.now();
  pruneExpiredWebSessions(now);

  const entry = webRepositorySessions.get(conversationId);
  if (!entry || entry.expiresAt <= now) {
    if (entry) {
      removeWebRepositorySession(conversationId);
    }
    return null;
  }

  return entry.session;
}

export function setWebConversationRepositorySession(
  conversationId: string,
  session: ConversationRepositorySession,
): void {
  const now = Date.now();
  pruneExpiredWebSessions(now);
  webRepositorySessions.set(conversationId, {
    session,
    expiresAt: now + WEB_SESSION_TTL_MS,
  });
  pruneExpiredWebSessions(now);
}
