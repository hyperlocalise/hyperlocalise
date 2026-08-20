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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const GITHUB_AUTO_REVIEW_ADDITIONAL_PROMPT_MAX_LENGTH = 8_000;
export const GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID = "auto-review";

export type GithubAutoReviewRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

export type GithubAutoReviewSettingsRecord = {
  enabled: boolean;
  additionalPrompt: string;
  githubInstallationRepositoryIds: string[];
  repositories: GithubAutoReviewRepositoryOption[];
};

export type GithubAutoReviewSettingsWriteError =
  | { code: "github_repository_not_found" }
  | { code: "github_repository_not_enabled" }
  | { code: "github_repository_archived" };

const DEFAULT_SETTINGS: Omit<GithubAutoReviewSettingsRecord, "repositories"> = {
  enabled: false,
  additionalPrompt: "",
  githubInstallationRepositoryIds: [],
};

export async function listGithubAutoReviewRepositoryOptions(organizationId: string) {
  return db
    .select({
      id: schema.githubInstallationRepositories.id,
      fullName: schema.githubInstallationRepositories.fullName,
      enabled: schema.githubInstallationRepositories.enabled,
      archived: schema.githubInstallationRepositories.archived,
    })
    .from(schema.githubInstallationRepositories)
    .where(eq(schema.githubInstallationRepositories.organizationId, organizationId))
    .orderBy(schema.githubInstallationRepositories.fullName);
}

export async function getGithubAutoReviewSettings(
  organizationId: string,
): Promise<GithubAutoReviewSettingsRecord> {
  const repositories = await listGithubAutoReviewRepositoryOptions(organizationId);
  const [settings] = await db
    .select({
      enabled: schema.githubAutoReviewSettings.enabled,
      additionalPrompt: schema.githubAutoReviewSettings.additionalPrompt,
    })
    .from(schema.githubAutoReviewSettings)
    .where(eq(schema.githubAutoReviewSettings.organizationId, organizationId))
    .limit(1);

  const selectedRows = await db
    .select({
      githubInstallationRepositoryId:
        schema.githubAutoReviewRepositories.githubInstallationRepositoryId,
    })
    .from(schema.githubAutoReviewRepositories)
    .where(eq(schema.githubAutoReviewRepositories.organizationId, organizationId));

  const selectedIds = new Set(selectedRows.map((row) => row.githubInstallationRepositoryId));

  return {
    enabled: settings?.enabled ?? DEFAULT_SETTINGS.enabled,
    additionalPrompt: settings?.additionalPrompt ?? DEFAULT_SETTINGS.additionalPrompt,
    githubInstallationRepositoryIds: repositories
      .filter((repository) => selectedIds.has(repository.id))
      .map((repository) => repository.id),
    repositories,
  };
}

export async function isGithubAutoReviewEnabledForRepository(input: {
  organizationId: string;
  githubInstallationRepositoryId: string;
}): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: schema.githubAutoReviewSettings.enabled })
    .from(schema.githubAutoReviewSettings)
    .where(eq(schema.githubAutoReviewSettings.organizationId, input.organizationId))
    .limit(1);

  if (!settings?.enabled) {
    return false;
  }

  const [selected] = await db
    .select({ id: schema.githubAutoReviewRepositories.id })
    .from(schema.githubAutoReviewRepositories)
    .where(
      and(
        eq(schema.githubAutoReviewRepositories.organizationId, input.organizationId),
        eq(
          schema.githubAutoReviewRepositories.githubInstallationRepositoryId,
          input.githubInstallationRepositoryId,
        ),
      ),
    )
    .limit(1);

  return Boolean(selected);
}

export async function upsertGithubAutoReviewSettings(input: {
  organizationId: string;
  enabled: boolean;
  additionalPrompt: string;
  githubInstallationRepositoryIds: string[];
}): Promise<Result<GithubAutoReviewSettingsRecord, GithubAutoReviewSettingsWriteError>> {
  const uniqueIds = [...new Set(input.githubInstallationRepositoryIds)];
  if (uniqueIds.length > 0) {
    const owned = await db
      .select({
        id: schema.githubInstallationRepositories.id,
        enabled: schema.githubInstallationRepositories.enabled,
        archived: schema.githubInstallationRepositories.archived,
      })
      .from(schema.githubInstallationRepositories)
      .where(
        and(
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
          inArray(schema.githubInstallationRepositories.id, uniqueIds),
        ),
      );

    if (owned.length !== uniqueIds.length) {
      return err({ code: "github_repository_not_found" });
    }

    if (owned.some((repository) => repository.archived)) {
      return err({ code: "github_repository_archived" });
    }

    if (owned.some((repository) => !repository.enabled)) {
      return err({ code: "github_repository_not_enabled" });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.githubAutoReviewSettings)
      .values({
        organizationId: input.organizationId,
        enabled: input.enabled,
        additionalPrompt: input.additionalPrompt.trim(),
      })
      .onConflictDoUpdate({
        target: schema.githubAutoReviewSettings.organizationId,
        set: {
          enabled: input.enabled,
          additionalPrompt: input.additionalPrompt.trim(),
          updatedAt: new Date(),
        },
      });

    await tx
      .delete(schema.githubAutoReviewRepositories)
      .where(eq(schema.githubAutoReviewRepositories.organizationId, input.organizationId));

    if (uniqueIds.length > 0) {
      await tx.insert(schema.githubAutoReviewRepositories).values(
        uniqueIds.map((githubInstallationRepositoryId) => ({
          organizationId: input.organizationId,
          githubInstallationRepositoryId,
        })),
      );
    }
  });

  return ok(await getGithubAutoReviewSettings(input.organizationId));
}
