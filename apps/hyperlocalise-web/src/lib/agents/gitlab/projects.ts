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
import { and, eq, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { listGitlabMembershipProjects, type GitlabApiProject } from "./api";
import { getGitlabAccessToken, type GitlabConnectionTokenError } from "./tokens";

export type GitlabProjectSyncRecord = {
  id: string;
  name: string;
  pathWithNamespace: string;
  httpUrlToRepo: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
};

export type GitlabProjectSyncError =
  | GitlabConnectionTokenError
  | { code: "gitlab_project_list_failed"; message: string };

function sqlExcluded(column: string) {
  return sql`excluded.${sql.identifier(column)}`;
}

export function normalizeGitlabProject(project: GitlabApiProject): GitlabProjectSyncRecord | null {
  if (!project.id || !project.name || !project.path_with_namespace || !project.http_url_to_repo) {
    return null;
  }

  return {
    id: String(project.id),
    name: project.name,
    pathWithNamespace: project.path_with_namespace,
    httpUrlToRepo: project.http_url_to_repo,
    private: project.visibility === "private" || project.visibility === "internal",
    archived: project.archived ?? false,
    defaultBranch: project.default_branch ?? null,
  };
}

export async function upsertGitlabProjects(input: {
  organizationId: string;
  gitlabConnectionId: string;
  projects: GitlabProjectSyncRecord[];
}) {
  if (input.projects.length === 0) {
    return;
  }

  const now = new Date();
  await db
    .insert(schema.gitlabProjects)
    .values(
      input.projects.map((project) => ({
        organizationId: input.organizationId,
        gitlabConnectionId: input.gitlabConnectionId,
        gitlabProjectId: project.id,
        name: project.name,
        pathWithNamespace: project.pathWithNamespace,
        httpUrlToRepo: project.httpUrlToRepo,
        private: project.private,
        archived: project.archived,
        defaultBranch: project.defaultBranch,
        lastSyncedAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.gitlabProjects.gitlabConnectionId, schema.gitlabProjects.gitlabProjectId],
      set: {
        name: sqlExcluded("name"),
        pathWithNamespace: sqlExcluded("path_with_namespace"),
        httpUrlToRepo: sqlExcluded("http_url_to_repo"),
        private: sqlExcluded("private"),
        archived: sqlExcluded("archived"),
        defaultBranch: sqlExcluded("default_branch"),
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
}

export async function syncGitlabConnectionProjects(input: {
  organizationId: string;
  gitlabConnectionId: string;
}): Promise<Result<GitlabProjectSyncRecord[], GitlabProjectSyncError>> {
  const tokenResult = await getGitlabAccessToken({
    organizationId: input.organizationId,
    connectionId: input.gitlabConnectionId,
  });
  if (isErr(tokenResult)) {
    return tokenResult;
  }

  const listed = await listGitlabMembershipProjects({
    baseUrl: tokenResult.value.baseUrl,
    accessToken: tokenResult.value.accessToken,
  });
  if (isErr(listed)) {
    return err({
      code: "gitlab_project_list_failed",
      message: listed.error.message,
    });
  }

  const projects = listed.value
    .map(normalizeGitlabProject)
    .filter((project): project is GitlabProjectSyncRecord => project !== null);

  await upsertGitlabProjects({
    organizationId: input.organizationId,
    gitlabConnectionId: input.gitlabConnectionId,
    projects,
  });

  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) {
    await db
      .delete(schema.gitlabProjects)
      .where(
        and(
          eq(schema.gitlabProjects.organizationId, input.organizationId),
          eq(schema.gitlabProjects.gitlabConnectionId, input.gitlabConnectionId),
        ),
      );
  } else {
    await db
      .delete(schema.gitlabProjects)
      .where(
        and(
          eq(schema.gitlabProjects.organizationId, input.organizationId),
          eq(schema.gitlabProjects.gitlabConnectionId, input.gitlabConnectionId),
          notInArray(schema.gitlabProjects.gitlabProjectId, projectIds),
        ),
      );
  }

  return ok(projects);
}
