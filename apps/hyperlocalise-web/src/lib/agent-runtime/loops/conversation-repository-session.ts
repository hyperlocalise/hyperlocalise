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
import { and, eq, lte } from "drizzle-orm";

import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";
import { stopRepositorySandbox } from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { db, schema } from "@/lib/database/client";
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

export const WEB_SESSION_TTL_MS = 30 * 60 * 1000;

export type WebConversationRepositorySessionState = {
  session: ConversationRepositorySession;
  version: number;
};

const webRepositorySandboxLeaseCounts = new Map<string, number>();
const pendingWebRepositorySandboxStops = new Set<string>();

export function acquireWebRepositorySandboxLease(sandboxId: string): () => void {
  const nextCount = (webRepositorySandboxLeaseCounts.get(sandboxId) ?? 0) + 1;
  webRepositorySandboxLeaseCounts.set(sandboxId, nextCount);

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseWebRepositorySandboxLease(sandboxId);
  };
}

function releaseWebRepositorySandboxLease(sandboxId: string) {
  const currentCount = webRepositorySandboxLeaseCounts.get(sandboxId) ?? 0;
  if (currentCount <= 1) {
    webRepositorySandboxLeaseCounts.delete(sandboxId);
  } else {
    webRepositorySandboxLeaseCounts.set(sandboxId, currentCount - 1);
  }

  if (
    (webRepositorySandboxLeaseCounts.get(sandboxId) ?? 0) === 0 &&
    pendingWebRepositorySandboxStops.delete(sandboxId)
  ) {
    void stopRepositorySandbox(sandboxId).catch((error: unknown) => {
      logger.warn(
        { err: serializeErrorForLog(error), sandboxId },
        "web repository sandbox cleanup failed during deferred session eviction",
      );
    });
  }
}

function isWebRepositorySandboxInUse(sandboxId: string) {
  return (webRepositorySandboxLeaseCounts.get(sandboxId) ?? 0) > 0;
}

function releaseWebSessionSandbox(session: ConversationRepositorySession) {
  const sandboxId = session.repositorySandboxSession?.sandboxId;
  if (!sandboxId) {
    return;
  }

  if (isWebRepositorySandboxInUse(sandboxId)) {
    pendingWebRepositorySandboxStops.add(sandboxId);
    return;
  }

  void stopRepositorySandbox(sandboxId).catch((error: unknown) => {
    logger.warn(
      { err: serializeErrorForLog(error), sandboxId },
      "web repository sandbox cleanup failed during session eviction",
    );
  });
}

function asConversationRepositorySession(value: unknown): ConversationRepositorySession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ConversationRepositorySession;
}

type InteractionRepositorySessionRow = {
  organizationId: string;
  session: unknown;
  version: number;
  expiresAt: Date;
};

async function readInteractionRepositorySessionRow(
  conversationId: string,
): Promise<InteractionRepositorySessionRow | null> {
  const [row] = await db
    .select({
      organizationId: schema.interactionRepositorySessions.organizationId,
      session: schema.interactionRepositorySessions.session,
      version: schema.interactionRepositorySessions.version,
      expiresAt: schema.interactionRepositorySessions.expiresAt,
    })
    .from(schema.interactionRepositorySessions)
    .where(eq(schema.interactionRepositorySessions.interactionId, conversationId))
    .limit(1);

  return row ?? null;
}

async function deleteExpiredSessionRow(input: {
  interactionId: string;
  organizationId: string;
  version: number;
  expiresAt: Date;
  session: ConversationRepositorySession;
}) {
  // Compare-and-delete on the observed version and expiry so a concurrent refresh
  // cannot be wiped by a stale cleanup path.
  const deleted = await db
    .delete(schema.interactionRepositorySessions)
    .where(
      and(
        eq(schema.interactionRepositorySessions.interactionId, input.interactionId),
        eq(schema.interactionRepositorySessions.organizationId, input.organizationId),
        eq(schema.interactionRepositorySessions.version, input.version),
        lte(schema.interactionRepositorySessions.expiresAt, input.expiresAt),
      ),
    )
    .returning({
      interactionId: schema.interactionRepositorySessions.interactionId,
    });

  if (deleted.length === 0) {
    return false;
  }

  releaseWebSessionSandbox(input.session);
  return true;
}

export async function getWebConversationRepositorySession(
  conversationId: string,
): Promise<WebConversationRepositorySessionState | null> {
  const row = await readInteractionRepositorySessionRow(conversationId);
  if (!row) {
    return null;
  }

  const session = asConversationRepositorySession(row.session);
  if (!session) {
    await db
      .delete(schema.interactionRepositorySessions)
      .where(eq(schema.interactionRepositorySessions.interactionId, conversationId));
    return null;
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    const deleted = await deleteExpiredSessionRow({
      interactionId: conversationId,
      organizationId: row.organizationId,
      version: row.version,
      expiresAt: row.expiresAt,
      session,
    });
    if (!deleted) {
      // Another turn refreshed the row; return the live session instead of null.
      return getWebConversationRepositorySession(conversationId);
    }
    return null;
  }

  return {
    session,
    version: row.version,
  };
}

export async function setWebConversationRepositorySession(
  conversationId: string,
  input: {
    organizationId: string;
    baseVersion: number | null;
    session: ConversationRepositorySession;
  },
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WEB_SESSION_TTL_MS);

  let existing = await readInteractionRepositorySessionRow(conversationId);
  let existingSession: ConversationRepositorySession | null = null;
  let currentVersion: number | null = null;

  if (existing) {
    existingSession = asConversationRepositorySession(existing.session);
    if (existing.expiresAt.getTime() <= now.getTime()) {
      const deleted = await deleteExpiredSessionRow({
        interactionId: conversationId,
        organizationId: existing.organizationId,
        version: existing.version,
        expiresAt: existing.expiresAt,
        session: existingSession ?? {},
      });
      if (deleted) {
        existingSession = null;
        currentVersion = null;
      } else {
        existing = await readInteractionRepositorySessionRow(conversationId);
        if (!existing || existing.expiresAt.getTime() <= now.getTime()) {
          existingSession = null;
          currentVersion = null;
        } else {
          existingSession = asConversationRepositorySession(existing.session);
          currentVersion = existing.version;
        }
      }
    } else {
      currentVersion = existing.version;
    }
  }

  if (currentVersion !== input.baseVersion) {
    releaseWebSessionSandbox(input.session);
    return false;
  }

  const existingSandboxId = existingSession?.repositorySandboxSession?.sandboxId;
  const nextSandboxId = input.session.repositorySandboxSession?.sandboxId;
  if (existingSandboxId && existingSandboxId !== nextSandboxId) {
    releaseWebSessionSandbox(existingSession ?? {});
  }

  const nextVersion = (input.baseVersion ?? 0) + 1;
  const sessionPayload = input.session as Record<string, unknown>;

  if (currentVersion === null) {
    try {
      await db.insert(schema.interactionRepositorySessions).values({
        interactionId: conversationId,
        organizationId: input.organizationId,
        session: sessionPayload,
        version: nextVersion,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      return true;
    } catch (error: unknown) {
      // Concurrent first write lost the race on the primary key.
      releaseWebSessionSandbox(input.session);
      logger.warn(
        {
          err: serializeErrorForLog(error),
          conversationId,
          organizationId: input.organizationId,
        },
        "web repository session insert lost a concurrency race",
      );
      return false;
    }
  }

  const updated = await db
    .update(schema.interactionRepositorySessions)
    .set({
      session: sessionPayload,
      version: nextVersion,
      expiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.interactionRepositorySessions.interactionId, conversationId),
        eq(schema.interactionRepositorySessions.version, currentVersion),
      ),
    )
    .returning({
      interactionId: schema.interactionRepositorySessions.interactionId,
    });

  if (updated.length === 0) {
    releaseWebSessionSandbox(input.session);
    return false;
  }

  return true;
}
