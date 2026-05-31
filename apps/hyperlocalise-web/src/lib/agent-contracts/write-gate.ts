import { hasCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import type {
  RepositoryAgentActor,
  RepositoryAgentTaskSource,
  RepositoryAgentWorkMode,
} from "@/lib/agent-contracts/repository-task";

export type WriteAction = "upload_sources" | "apply_fixes" | "commit_changes" | "push_to_branch";

export type WriteGateResult = { allowed: true } | { allowed: false; reason: string };

function hasAdminCapability(role: OrganizationMembershipRole | null | undefined) {
  return role ? hasCapability(role, "integrations:write") : false;
}

function canApproveAgentWrite(role: OrganizationMembershipRole | null | undefined) {
  return role ? hasCapability(role, "agent_write:approve") : false;
}

/**
 * Determine whether a repository write action is allowed for the current task.
 */
export function checkRepositoryWriteGate(input: {
  workMode: RepositoryAgentWorkMode;
  source: RepositoryAgentTaskSource;
  actor: RepositoryAgentActor;
  action: WriteAction;
}): WriteGateResult {
  if (input.workMode === "read_only") {
    return {
      allowed: false,
      reason: "This workflow is running in read-only mode. Write actions are not permitted.",
    };
  }

  if (input.source === "slack") {
    return checkSlackWriteGate(input.workMode, input.actor);
  }

  if (input.source === "github") {
    return checkGitHubWriteGate(input.workMode, input.actor);
  }

  return checkVerifiedMemberWriteGate(input.actor);
}

function checkSlackWriteGate(
  _workMode: RepositoryAgentWorkMode,
  actor: RepositoryAgentActor,
): WriteGateResult {
  if (actor.role && hasAdminCapability(actor.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "Slack-triggered write actions require admin privileges. Regular members run in read-only mode.",
  };
}

function checkVerifiedMemberWriteGate(actor: RepositoryAgentActor): WriteGateResult {
  const isMember = actor.role === "admin" || actor.role === "member";
  if (isMember) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Write actions require a verified workspace member.",
  };
}

function checkGitHubWriteGate(
  workMode: RepositoryAgentWorkMode,
  actor: RepositoryAgentActor,
): WriteGateResult {
  const isAdmin = canApproveAgentWrite(actor.role);

  if (workMode === "write") {
    return { allowed: true };
  }

  if (isAdmin) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "Write actions in this workflow require admin privileges. Please contact a workspace admin.",
  };
}
