import type { OrganizationMembershipRole } from "@/lib/database/types";
import type {
  RepositoryAgentActor,
  RepositoryAgentTaskSource,
  RepositoryAgentWorkMode,
} from "@/lib/agent-contracts/repository-task";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import {
  checkRepositoryWriteGate,
  type WriteAction,
  type WriteGateResult,
} from "@/lib/agent-contracts/write-gate";

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

export function resolveToolPolicy(input: {
  organizationId: string;
  membershipRole: OrganizationMembershipRole;
  rules?: ToolPolicyRule[];
}): ResolvedToolPolicy {
  if (input.rules && input.rules.length > 0) {
    throw new Error("Tool policy rules are not implemented yet.");
  }

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
