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
import { and, eq, inArray, sql } from "drizzle-orm";

import type { ActivityActorKind } from "@/lib/activity-log/activity-log-contract";
import { schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database/client";
import { createLogger } from "@/lib/log";

const logger = createLogger("project-translation-revisions");

type Provenance = (typeof schema.projectTranslations.$inferSelect)["provenance"];
type Status = (typeof schema.projectTranslations.$inferSelect)["status"];

export type TranslationRevisionActor = {
  actorKind: ActivityActorKind;
  actorUserId: string | null;
};

/** The `project_translations` columns a revision copies; pass to `.returning()` on every write. */
export const projectTranslationRevisionColumns = {
  id: schema.projectTranslations.id,
  organizationId: schema.projectTranslations.organizationId,
  projectId: schema.projectTranslations.projectId,
  translationKeyId: schema.projectTranslations.translationKeyId,
  targetLocale: schema.projectTranslations.targetLocale,
  text: schema.projectTranslations.text,
  status: schema.projectTranslations.status,
  provenance: schema.projectTranslations.provenance,
  sourceJobId: schema.projectTranslations.sourceJobId,
};

export type ProjectTranslationRevisionSource = {
  id: string;
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  text: string;
  status: Status;
  provenance: Provenance;
  sourceJobId: string | null;
};

type ProjectTranslationSnapshot = ProjectTranslationRevisionSource & { updatedAt: Date };

/** Translations as they were before a write, keyed by translation id. */
export type ProjectTranslationSnapshots = Map<string, ProjectTranslationSnapshot>;

export function revisionActorForProvenance(provenance: Provenance): TranslationRevisionActor {
  switch (provenance) {
    case "agent":
      return { actorKind: "agent", actorUserId: null };
    case "manual":
      return { actorKind: "user", actorUserId: null };
    case "translation_job":
    case "import":
      return { actorKind: "system", actorUserId: null };
  }
}

function defaultOperationId(row: ProjectTranslationRevisionSource): string | null {
  return row.provenance === "translation_job" && row.sourceJobId ? `job:${row.sourceJobId}` : null;
}

type ProjectTranslationWriteScope = {
  organizationId: string;
  translationKeyIds: string[];
  targetLocales: string[];
};

/**
 * Runs a write to `project_translations` and its revisions in one transaction. `write` gets the
 * transaction and the translations as they were once the keys were locked; it must write through
 * that transaction and call `recordProjectTranslationRevisions` with it.
 *
 * The key rows are locked rather than the translations, because a translation that does not
 * exist yet has no row to lock. The editor in go-svc takes the same key locks, so concurrent
 * writes to a key run one at a time and each revision records the value its write left behind.
 */
export async function writeProjectTranslations<T>(
  database: DatabaseClient,
  scope: ProjectTranslationWriteScope,
  write: (tx: DatabaseTransaction, before: ProjectTranslationSnapshots) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await lockProjectTranslationKeys(tx, scope);
    const before = await snapshotProjectTranslations(tx, scope);
    return write(tx, before);
  });
}

async function lockProjectTranslationKeys(
  tx: DatabaseTransaction,
  scope: ProjectTranslationWriteScope,
) {
  const keyIds = [...new Set(scope.translationKeyIds)];
  if (keyIds.length === 0) return;
  // Id order matches go-svc's key locks, so two writers covering the same keys cannot deadlock.
  await tx
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, scope.organizationId),
        inArray(schema.projectTranslationKeys.id, keyIds),
      ),
    )
    .orderBy(schema.projectTranslationKeys.id)
    .for("no key update");
}

async function snapshotProjectTranslations(
  database: DatabaseClient,
  input: ProjectTranslationWriteScope,
): Promise<ProjectTranslationSnapshots> {
  const snapshots: ProjectTranslationSnapshots = new Map();
  if (input.translationKeyIds.length === 0 || input.targetLocales.length === 0) {
    return snapshots;
  }
  const rows = await database
    .select({
      ...projectTranslationRevisionColumns,
      updatedAt: schema.projectTranslations.updatedAt,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        inArray(schema.projectTranslations.translationKeyId, [...new Set(input.translationKeyIds)]),
        inArray(schema.projectTranslations.targetLocale, [...new Set(input.targetLocales)]),
      ),
    );
  for (const row of rows) {
    snapshots.set(row.id, row);
  }
  return snapshots;
}

/**
 * Appends a revision for each saved translation whose text or status changed. The first time a
 * translation with no history changes, its earlier state is kept as a baseline revision so the
 * edit can be undone. Call it inside `writeProjectTranslations`. A failure throws so the whole
 * write rolls back: restore and undo treat the latest revision as the current value, so a
 * translation change without its revision could be overwritten without a conflict.
 *
 * @returns the new revision id for each changed translation id.
 */
export async function recordProjectTranslationRevisions(
  tx: DatabaseTransaction,
  input: {
    before: ProjectTranslationSnapshots;
    saved: ProjectTranslationRevisionSource[];
    actor?: TranslationRevisionActor;
    operationId?: string | null;
  },
): Promise<Map<string, string>> {
  const revisionIds = new Map<string, string>();
  const changed = input.saved.filter((row) => {
    const before = input.before.get(row.id);
    return !before || before.text !== row.text || before.status !== row.status;
  });
  if (changed.length === 0) {
    return revisionIds;
  }
  try {
    const existingIds = changed.filter((row) => input.before.has(row.id)).map((row) => row.id);
    const withHistory = new Set<string>();
    if (existingIds.length > 0) {
      const rows = await tx
        .selectDistinct({ translationId: schema.projectTranslationRevisions.translationId })
        .from(schema.projectTranslationRevisions)
        .where(inArray(schema.projectTranslationRevisions.translationId, existingIds));
      for (const row of rows) withHistory.add(row.translationId);
    }
    const baselines = existingIds.flatMap((id) => {
      const before = input.before.get(id);
      if (!before || withHistory.has(id)) return [];
      // A baseline belongs to no operation, so undoing the write that follows it (even a retry
      // of the job that wrote the baseline's text) finds the baseline as the earlier state.
      return [
        {
          ...revisionValues(before, revisionActorForProvenance(before.provenance)),
          operationId: null,
          createdAt: before.updatedAt,
        },
      ];
    });
    if (baselines.length > 0) {
      await tx.insert(schema.projectTranslationRevisions).values(baselines);
    }
    const inserted = await tx
      .insert(schema.projectTranslationRevisions)
      .values(
        changed.map((row) => ({
          ...revisionValues(row, input.actor ?? revisionActorForProvenance(row.provenance)),
          operationId: input.operationId ?? defaultOperationId(row),
          createdAt: sql`clock_timestamp()`,
        })),
      )
      .returning({
        id: schema.projectTranslationRevisions.id,
        translationId: schema.projectTranslationRevisions.translationId,
      });
    for (const row of inserted) revisionIds.set(row.translationId, row.id);
  } catch (error) {
    logger.error(
      { error, translationCount: changed.length },
      "failed to record project translation revisions",
    );
    throw error;
  }
  return revisionIds;
}

function revisionValues(row: ProjectTranslationRevisionSource, actor: TranslationRevisionActor) {
  return {
    organizationId: row.organizationId,
    projectId: row.projectId,
    translationId: row.id,
    translationKeyId: row.translationKeyId,
    targetLocale: row.targetLocale,
    text: row.text,
    status: row.status,
    provenance: row.provenance,
    sourceJobId: row.sourceJobId,
    actorKind: actor.actorKind,
    actorUserId: actor.actorUserId,
  };
}
