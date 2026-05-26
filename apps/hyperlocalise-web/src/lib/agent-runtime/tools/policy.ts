import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  checkRepositoryWriteGate,
  type WriteAction,
  type WriteGateResult,
} from "@/lib/agents/repository-write-gate";
import type {
  RepositoryAgentActor,
  RepositoryAgentTaskSource,
  RepositoryAgentWorkMode,
} from "@/lib/agents/repository-agent-task";
import type { ToolContext } from "@/lib/tools/types";

export type ToolPolicyEffect = "allow" | "deny" | "require_approval";

export type ToolPolicyRule = {
  scope: "organization" | "team" | "member";
  subjectId: string;
  toolName: string;
  effect: ToolPolicyEffect;
};

export type ResolvedToolPolicy = {
  isToolAllowed(toolName: string): boolean;
};

export function resolveToolPolicy(_input: {
  organizationId: string;
  membershipRole: OrganizationMembershipRole;
  rules?: ToolPolicyRule[];
}): ResolvedToolPolicy {
  return {
    isToolAllowed: () => true,
  };
}

export function assertRepositoryWriteAllowed(
  ctx: Pick<ToolContext, "workMode" | "repositorySource" | "actor">,
  action: WriteAction,
): WriteGateResult {
  if (!ctx.workMode || !ctx.repositorySource || !ctx.actor) {
    return {
      allowed: false,
      reason: "Write context is not available for this tool.",
    };
  }

  return checkRepositoryWriteGate({
    workMode: ctx.workMode as RepositoryAgentWorkMode,
    source: ctx.repositorySource as RepositoryAgentTaskSource,
    actor: ctx.actor as RepositoryAgentActor,
    action,
  });
}
