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
import { and, eq } from "drizzle-orm";

import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/repository-task";
import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export function buildRepositoryGitLabContextInstructions(
  context: RepositoryAgentGitLabContext,
): string {
  return [
    "Resolved GitLab repository context:",
    `- connectionId: ${context.connectionId}`,
    `- project: ${context.pathWithNamespace}`,
    context.mergeRequestIid === undefined ? null : `- mergeRequestIid: ${context.mergeRequestIid}`,
    context.branch ? `- branch: ${context.branch}` : null,
    context.commitSha ? `- commitSha: ${context.commitSha}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Build a resolved GitLab context for an enabled project in the organization.
 */
export async function resolveEnabledGitlabProjectContext(input: {
  organizationId: string;
  gitlabProjectId: string;
  branch?: string;
  commitSha?: string;
  mergeRequestIid?: number;
}): Promise<
  Result<
    RepositoryAgentGitLabContext,
    { code: "gitlab_project_not_enabled" | "gitlab_project_not_found" }
  >
> {
  const [project] = await db
    .select({
      id: schema.gitlabProjects.id,
      gitlabProjectId: schema.gitlabProjects.gitlabProjectId,
      pathWithNamespace: schema.gitlabProjects.pathWithNamespace,
      httpUrlToRepo: schema.gitlabProjects.httpUrlToRepo,
      defaultBranch: schema.gitlabProjects.defaultBranch,
      enabled: schema.gitlabProjects.enabled,
      gitlabConnectionId: schema.gitlabProjects.gitlabConnectionId,
    })
    .from(schema.gitlabProjects)
    .where(
      and(
        eq(schema.gitlabProjects.organizationId, input.organizationId),
        eq(schema.gitlabProjects.gitlabProjectId, input.gitlabProjectId),
      ),
    )
    .limit(1);

  if (!project) {
    return err({ code: "gitlab_project_not_found" });
  }

  if (!project.enabled) {
    return err({ code: "gitlab_project_not_enabled" });
  }

  return ok({
    resolved: true,
    organizationId: input.organizationId,
    connectionId: project.gitlabConnectionId,
    projectId: project.gitlabProjectId,
    pathWithNamespace: project.pathWithNamespace,
    httpUrlToRepo: project.httpUrlToRepo,
    branch: input.branch ?? project.defaultBranch ?? undefined,
    commitSha: input.commitSha,
    mergeRequestIid: input.mergeRequestIid,
  });
}
