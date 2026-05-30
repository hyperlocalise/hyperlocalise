import { and, eq, isNotNull, lte, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
  mergeGithubRepositoryAutomationSettings,
  normalizeStoredGithubRepositoryAutomationSettings,
  resolveNextRunAtForSettings,
  type GithubRepositoryAutomationSettings,
  type GithubRepositoryAutomationSettingsPartial,
  validateGithubRepositoryAutomationSettings,
} from "./github-repository-automation-settings";

type SettingsRow = typeof schema.githubRepositoryAutomationSettings.$inferSelect;

function rowToPartial(row: SettingsRow | null): GithubRepositoryAutomationSettingsPartial {
  if (!row) {
    return {};
  }

  return normalizeStoredGithubRepositoryAutomationSettings(row.settings);
}

function parseStoredSettings(
  merged: GithubRepositoryAutomationSettings,
  defaults: GithubRepositoryAutomationSettings,
): Record<string, unknown> {
  const stored: Record<string, unknown> = {};

  if (
    merged.workflows.pushSource.enabled !== defaults.workflows.pushSource.enabled ||
    merged.workflows.pullTranslations.enabled !== defaults.workflows.pullTranslations.enabled ||
    merged.workflows.validation.enabled !== defaults.workflows.validation.enabled
  ) {
    stored.workflows = merged.workflows;
  }

  if (merged.trigger !== defaults.trigger) {
    stored.trigger = merged.trigger;
  }

  return stored;
}

export type GithubRepositoryAutomationSettingsRecord = {
  githubRepositoryId: string;
  githubInstallationRepositoryId: string;
  settings: GithubRepositoryAutomationSettings;
  configVersion: number;
  nextRunAt: string | null;
  stored: {
    id: string;
    updatedAt: string;
  } | null;
};

function serializeRecord(input: {
  githubRepositoryId: string;
  githubInstallationRepositoryId: string;
  settings: GithubRepositoryAutomationSettings;
  row: SettingsRow | null;
}): GithubRepositoryAutomationSettingsRecord {
  return {
    githubRepositoryId: input.githubRepositoryId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    settings: input.settings,
    configVersion: input.row?.configVersion ?? 0,
    nextRunAt: input.row?.nextRunAt?.toISOString() ?? null,
    stored: input.row
      ? {
          id: input.row.id,
          updatedAt: input.row.updatedAt.toISOString(),
        }
      : null,
  };
}

async function getSettingsRowByRepositoryId(githubInstallationRepositoryId: string) {
  const [row] = await db
    .select()
    .from(schema.githubRepositoryAutomationSettings)
    .where(
      eq(
        schema.githubRepositoryAutomationSettings.githubInstallationRepositoryId,
        githubInstallationRepositoryId,
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getGithubRepositoryAutomationSettings(input: {
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
}): Promise<GithubRepositoryAutomationSettingsRecord> {
  const row = await getSettingsRowByRepositoryId(input.githubInstallationRepositoryId);
  const settings = mergeGithubRepositoryAutomationSettings(
    DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
    rowToPartial(row),
  );

  return serializeRecord({
    githubRepositoryId: input.githubRepositoryId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    settings,
    row,
  });
}

export async function upsertGithubRepositoryAutomationSettings(input: {
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  settings: GithubRepositoryAutomationSettingsPartial;
}) {
  const existing = await getSettingsRowByRepositoryId(input.githubInstallationRepositoryId);
  const mergedSettings = mergeGithubRepositoryAutomationSettings(
    mergeGithubRepositoryAutomationSettings(
      DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
      rowToPartial(existing),
    ),
    input.settings,
  );

  const validationError = validateGithubRepositoryAutomationSettings(mergedSettings);
  if (validationError) {
    throw new Error(validationError);
  }

  const storedSettings = parseStoredSettings(
    mergedSettings,
    DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
  );
  const nextRunAt = resolveNextRunAtForSettings(mergedSettings);

  await db
    .insert(schema.githubRepositoryAutomationSettings)
    .values({
      organizationId: input.organizationId,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      settings: storedSettings,
      nextRunAt,
    })
    .onConflictDoUpdate({
      target: schema.githubRepositoryAutomationSettings.githubInstallationRepositoryId,
      set: {
        settings: storedSettings,
        configVersion: sql`${schema.githubRepositoryAutomationSettings.configVersion} + 1`,
        nextRunAt,
        updatedAt: new Date(),
      },
    });

  return getGithubRepositoryAutomationSettings({
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubRepositoryId: input.githubRepositoryId,
  });
}

export async function deleteGithubRepositoryAutomationSettings(input: {
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
}) {
  await db
    .delete(schema.githubRepositoryAutomationSettings)
    .where(
      eq(
        schema.githubRepositoryAutomationSettings.githubInstallationRepositoryId,
        input.githubInstallationRepositoryId,
      ),
    );

  return getGithubRepositoryAutomationSettings({
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubRepositoryId: input.githubRepositoryId,
  });
}

export type DueGithubRepositoryAutomationSettings = {
  row: SettingsRow;
  repository: typeof schema.githubInstallationRepositories.$inferSelect;
  settings: GithubRepositoryAutomationSettings;
};

export async function listDueGithubRepositoryAutomationSettings(input: {
  now?: Date;
  limit?: number;
}): Promise<DueGithubRepositoryAutomationSettings[]> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;

  const rows = await db
    .select({
      settings: schema.githubRepositoryAutomationSettings,
      repository: schema.githubInstallationRepositories,
    })
    .from(schema.githubRepositoryAutomationSettings)
    .innerJoin(
      schema.githubInstallationRepositories,
      eq(
        schema.githubRepositoryAutomationSettings.githubInstallationRepositoryId,
        schema.githubInstallationRepositories.id,
      ),
    )
    .where(
      and(
        isNotNull(schema.githubRepositoryAutomationSettings.nextRunAt),
        lte(schema.githubRepositoryAutomationSettings.nextRunAt, now),
        eq(schema.githubInstallationRepositories.enabled, true),
        eq(schema.githubInstallationRepositories.archived, false),
      ),
    )
    .limit(limit);

  return rows.map(({ settings: row, repository }) => ({
    row,
    repository,
    settings: mergeGithubRepositoryAutomationSettings(
      DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
      rowToPartial(row),
    ),
  }));
}

export async function advanceGithubRepositoryAutomationNextRun(input: {
  settingsRowId: string;
  settings: GithubRepositoryAutomationSettings;
  completedAt?: Date;
}) {
  const nextRunAt = resolveNextRunAtForSettings(input.settings, input.completedAt ?? new Date());

  await db
    .update(schema.githubRepositoryAutomationSettings)
    .set({
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubRepositoryAutomationSettings.id, input.settingsRowId));
}
