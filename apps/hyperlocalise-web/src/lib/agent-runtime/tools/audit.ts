import { schema } from "@/lib/database";
import type { ToolContext } from "@/lib/tools/types";
import type { WriteAction } from "@/lib/agents/repository-write-gate";

export async function auditRepositoryMutation(
  ctx: ToolContext,
  input: {
    action: WriteAction;
    status: "pending" | "approved" | "denied" | "completed" | "failed";
    details?: {
      changedPaths?: string[];
      commands?: string[];
      error?: string;
      reason?: string;
    };
  },
) {
  const taskId = ctx.conversationId;
  const workflowRunId = ctx.workflowRunId ?? ctx.conversationId;
  await ctx.db.insert(schema.repoTmsMutationLogs).values({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    workflowRunId,
    taskId,
    actor: {
      sourceUserId: ctx.actor?.sourceUserId ?? "unknown",
      userId: ctx.actor?.userId,
      email: ctx.actor?.email,
      displayName: ctx.actor?.displayName,
      role: ctx.actor?.role,
    },
    action: input.action,
    source: ctx.repositorySource ?? (ctx.actor ? "repository_agent" : "unknown"),
    provider: ctx.githubContext ? "github" : "repository",
    status: input.status,
    details: input.details ?? {},
  });
}
