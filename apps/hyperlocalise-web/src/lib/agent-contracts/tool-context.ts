/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { db } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import type {
  RepositoryAgentActor,
  RepositoryAgentGitHubContext,
  RepositoryAgentTaskSource,
  RepositoryAgentWorkMode,
} from "@/lib/agent-contracts/repository-task";

export type AgentTodoItem = {
  id: string;
  content: string;
  status: "todo" | "in-progress" | "completed";
};

export type AgentSessionState = {
  todos: AgentTodoItem[];
};

export function ensureAgentSession(ctx: { agentSession?: AgentSessionState }): AgentSessionState {
  if (!ctx.agentSession) {
    ctx.agentSession = { todos: [] };
  }
  return ctx.agentSession;
}

/**
 * Request-scoped context passed to every chat tool.
 *
 * Tools use this object to scope database queries and side effects
 * to the current organization, conversation, and project.
 */
export type ToolContext = {
  conversationId: string;
  workflowRunId?: string | null;
  organizationId: string;
  /** Hyperlocalise user id for team-scoped project and asset access. */
  localUserId: string;
  membershipRole: OrganizationMembershipRole;
  projectId: string | null;
  db: typeof db;
  /** Repository agent context (optional, populated for repository workflows). */
  workMode?: RepositoryAgentWorkMode;
  repositorySource?: RepositoryAgentTaskSource;
  actor?: RepositoryAgentActor;
  sandboxId?: string | null;
  githubContext?: RepositoryAgentGitHubContext | null;
  /** Mutable per-run session state (todos, etc.). */
  agentSession?: AgentSessionState;
};
