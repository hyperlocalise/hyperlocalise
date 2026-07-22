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
import { schema } from "@/lib/database";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import type { WriteAction } from "@/lib/agent-contracts/write-gate";

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
