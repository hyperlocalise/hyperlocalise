import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { getInstallationOctokit } from "./app";

export type GitHubRepositorySyncRecord = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
};

type GitHubRepositoryLike = {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  archived?: boolean;
  default_branch?: string | null;
  owner?: {
    login?: string;
  } | null;
};

export function normalizeGitHubRepository(
  repository: GitHubRepositoryLike,
): GitHubRepositorySyncRecord | null {
  const [ownerFromFullName, nameFromFullName] = repository.full_name.split("/");
  const owner = repository.owner?.login ?? ownerFromFullName;
  const name = repository.name || nameFromFullName;
  if (!repository.id || !owner || !name || !repository.full_name) {
    return null;
  }

  return {
    id: repository.id,
    owner,
    name,
    fullName: repository.full_name,
    private: repository.private ?? false,
    archived: repository.archived ?? false,
    defaultBranch: repository.default_branch ?? null,
  };
}

export async function upsertGitHubInstallationRepositories(input: {
  organizationId: string;
  githubInstallationId: number;
  repositories: GitHubRepositorySyncRecord[];
}) {
  if (input.repositories.length === 0) {
    return;
  }

  const now = new Date();
  await db
    .insert(schema.githubInstallationRepositories)
    .values(
      input.repositories.map((repository) => ({
        organizationId: input.organizationId,
        githubInstallationId: input.githubInstallationId,
        githubRepositoryId: repository.id,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        private: repository.private,
        archived: repository.archived,
        defaultBranch: repository.defaultBranch,
        lastSyncedAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.githubInstallationRepositories.githubInstallationId,
        schema.githubInstallationRepositories.githubRepositoryId,
      ],
      set: {
        owner: sqlExcluded("owner"),
        name: sqlExcluded("name"),
        fullName: sqlExcluded("full_name"),
        private: sqlExcluded("private"),
        archived: sqlExcluded("archived"),
        defaultBranch: sqlExcluded("default_branch"),
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
}

export async function removeGitHubInstallationRepositories(input: {
  githubInstallationId: number;
  githubRepositoryIds: number[];
}) {
  if (input.githubRepositoryIds.length === 0) {
    return;
  }

  await db
    .delete(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.githubInstallationId, input.githubInstallationId),
        inArray(
          schema.githubInstallationRepositories.githubRepositoryId,
          input.githubRepositoryIds,
        ),
      ),
    );
}

export async function syncInstallationRepositories(input: {
  organizationId: string;
  githubInstallationId: number;
}) {
  const octokit = await getInstallationOctokit(input.githubInstallationId);
  const repositories = (
    await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    })
  )
    .map((repository) => normalizeGitHubRepository(repository))
    .filter((repository): repository is GitHubRepositorySyncRecord => repository !== null);

  await upsertGitHubInstallationRepositories({
    organizationId: input.organizationId,
    githubInstallationId: input.githubInstallationId,
    repositories,
  });

  if (repositories.length === 0) {
    await db
      .delete(schema.githubInstallationRepositories)
      .where(
        and(
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
          eq(
            schema.githubInstallationRepositories.githubInstallationId,
            input.githubInstallationId,
          ),
        ),
      );
    return repositories;
  }

  await db.delete(schema.githubInstallationRepositories).where(
    and(
      eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
      eq(schema.githubInstallationRepositories.githubInstallationId, input.githubInstallationId),
      notInArray(
        schema.githubInstallationRepositories.githubRepositoryId,
        repositories.map((repository) => repository.id),
      ),
    ),
  );

  return repositories;
}

function sqlExcluded(column: string) {
  return sql`excluded.${sql.identifier(column)}`;
}
