import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";

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

function pruneExpiredWebSessions(now: number) {
  for (const [conversationId, entry] of webRepositorySessions) {
    if (entry.expiresAt <= now) {
      webRepositorySessions.delete(conversationId);
    }
  }

  while (webRepositorySessions.size > WEB_SESSION_MAX_ENTRIES) {
    const oldestConversationId = webRepositorySessions.keys().next().value;
    if (!oldestConversationId) {
      break;
    }
    webRepositorySessions.delete(oldestConversationId);
  }
}

export function getWebConversationRepositorySession(
  conversationId: string,
): ConversationRepositorySession | null {
  const now = Date.now();
  pruneExpiredWebSessions(now);

  const entry = webRepositorySessions.get(conversationId);
  if (!entry || entry.expiresAt <= now) {
    webRepositorySessions.delete(conversationId);
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
}
