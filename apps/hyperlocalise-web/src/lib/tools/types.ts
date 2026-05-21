import type { db } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import type {
  RepoTmsAgentActor,
  RepoTmsAgentGitHubContext,
  RepoTmsAgentWorkMode,
} from "@/lib/agents/repo-tms-task";

/**
 * Request-scoped context passed to every chat tool.
 *
 * Tools use this object to scope database queries and side effects
 * to the current organization, conversation, and project.
 */
export type ToolContext = {
  conversationId: string;
  organizationId: string;
  membershipRole: OrganizationMembershipRole;
  projectId: string | null;
  db: typeof db;
  /** Repo/TMS agent context (optional, populated for repo-tms workflows). */
  workMode?: RepoTmsAgentWorkMode;
  actor?: RepoTmsAgentActor;
  sandboxId?: string | null;
  githubContext?: RepoTmsAgentGitHubContext | null;
};
