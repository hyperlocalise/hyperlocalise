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
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  DEFAULT_PROJECT_BRANCH_NAME,
  isValidProjectBranchName,
  normalizeProjectBranchName,
} from "./project-branch-name";

export type ProjectBranchStatus = "active" | "merged";

export type ProjectBranchRecord = {
  id: string;
  projectId: string;
  name: string;
  title: string | null;
  baseBranchId: string | null;
  isDefault: boolean;
  isProtected: boolean;
  status: ProjectBranchStatus;
  lastSyncedAt: string | null;
  createdByUserId: string | null;
  mergedAt: string | null;
  mergedIntoBranchId: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  keyCount: number;
};

export type ProjectBranchConflictStrategy = "use_branch" | "use_base";

export type ProjectBranchMergeChangeKind = "added" | "changed" | "conflicted";

export type ProjectBranchMergeTranslation = {
  locale: string;
  text: string;
  status: string;
};

export type ProjectBranchMergeChange = {
  kind: ProjectBranchMergeChangeKind;
  sourcePath: string | null;
  key: string;
  sourceText: string;
  targetSourceText: string | null;
  translations: ProjectBranchMergeTranslation[];
};

export type ProjectBranchErrorCode =
  | "invalid_branch_name"
  | "branch_not_found"
  | "branch_name_taken"
  | "default_branch_required"
  | "protected_branch"
  | "cannot_delete_default"
  | "cannot_delete_with_children"
  | "cannot_merge_into_self"
  | "cannot_merge_merged_branch"
  | "has_child_branches";

type BranchRow = typeof schema.projectBranches.$inferSelect;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toRecord(
  row: BranchRow,
  counts: { fileCount: number; keyCount: number },
): ProjectBranchRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    title: row.title,
    baseBranchId: row.baseBranchId,
    isDefault: row.isDefault,
    isProtected: row.isProtected,
    status: row.status,
    lastSyncedAt: toIso(row.lastSyncedAt),
    createdByUserId: row.createdByUserId,
    mergedAt: toIso(row.mergedAt),
    mergedIntoBranchId: row.mergedIntoBranchId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fileCount: counts.fileCount,
    keyCount: counts.keyCount,
  };
}

export class ProjectBranchService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "project-branches");
  }

  async ensureDefaultBranch(input: {
    organizationId: string;
    projectId: string;
    createdByUserId?: string | null;
  }): Promise<BranchRow> {
    const existing = await this.findActiveByName(input.projectId, DEFAULT_PROJECT_BRANCH_NAME);
    if (existing) {
      return existing;
    }

    const [created] = await this.database
      .insert(schema.projectBranches)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        name: DEFAULT_PROJECT_BRANCH_NAME,
        isDefault: true,
        createdByUserId: input.createdByUserId ?? null,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }

    const retry = await this.findActiveByName(input.projectId, DEFAULT_PROJECT_BRANCH_NAME);
    if (!retry) {
      throw new Error("Failed to ensure the default project branch.");
    }
    return retry;
  }

  async listActivePickerOptions(
    projectId: string,
  ): Promise<Array<{ name: string; title: string | null }>> {
    const rows = await this.list(projectId);
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({ name: row.name, title: row.title }));
  }

  async list(projectId: string): Promise<ProjectBranchRecord[]> {
    const rows = await this.database
      .select()
      .from(schema.projectBranches)
      .where(eq(schema.projectBranches.projectId, projectId))
      .orderBy(desc(schema.projectBranches.isDefault), schema.projectBranches.name);

    if (rows.length === 0) {
      return [];
    }

    const counts = await this.countByBranchName(projectId);
    return rows.map((row) => toRecord(row, counts.get(row.name) ?? { fileCount: 0, keyCount: 0 }));
  }

  async getByName(
    projectId: string,
    name: string,
  ): Promise<Result<ProjectBranchRecord, ProjectBranchErrorCode>> {
    const normalized = normalizeProjectBranchName(name);
    const row = await this.findActiveByName(projectId, normalized);
    if (!row) {
      return err("branch_not_found");
    }
    const counts = await this.countByBranchName(projectId, normalized);
    return ok(toRecord(row, counts.get(normalized) ?? { fileCount: 0, keyCount: 0 }));
  }

  async create(input: {
    organizationId: string;
    projectId: string;
    name: string;
    title?: string | null;
    baseBranchName?: string | null;
    createdByUserId?: string | null;
    clone?: boolean;
  }): Promise<Result<ProjectBranchRecord, ProjectBranchErrorCode>> {
    const name = normalizeProjectBranchName(input.name);
    if (!isValidProjectBranchName(name)) {
      return err("invalid_branch_name");
    }

    const taken = await this.findActiveByName(input.projectId, name);
    if (taken) {
      return err("branch_name_taken");
    }

    const base = await this.resolveBaseBranch(input.projectId, input.baseBranchName);
    if (!base) {
      return err("branch_not_found");
    }

    const created = await this.database.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.projectBranches)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          name,
          title: input.title?.trim() || null,
          baseBranchId: base.id,
          createdByUserId: input.createdByUserId ?? null,
        })
        .returning();
      if (!row) {
        throw new Error("Failed to create project branch.");
      }
      if (input.clone !== false) {
        await copyBranchContent(tx, {
          organizationId: input.organizationId,
          projectId: input.projectId,
          fromBranchName: base.name,
          toBranchName: name,
        });
      }
      return row;
    });

    const counts = await this.countByBranchName(input.projectId, name);
    return ok(toRecord(created, counts.get(name) ?? { fileCount: 0, keyCount: 0 }));
  }

  async update(input: {
    projectId: string;
    name: string;
    title?: string | null;
    isProtected?: boolean;
  }): Promise<Result<ProjectBranchRecord, ProjectBranchErrorCode>> {
    const row = await this.findActiveByName(
      input.projectId,
      normalizeProjectBranchName(input.name),
    );
    if (!row) {
      return err("branch_not_found");
    }

    const [updated] = await this.database
      .update(schema.projectBranches)
      .set({
        title: input.title === undefined ? row.title : input.title?.trim() || null,
        isProtected: input.isProtected ?? row.isProtected,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectBranches.id, row.id))
      .returning();
    if (!updated) {
      return err("branch_not_found");
    }
    const counts = await this.countByBranchName(input.projectId, updated.name);
    return ok(toRecord(updated, counts.get(updated.name) ?? { fileCount: 0, keyCount: 0 }));
  }

  async remove(input: {
    projectId: string;
    name: string;
  }): Promise<Result<void, ProjectBranchErrorCode>> {
    const row = await this.findActiveByName(
      input.projectId,
      normalizeProjectBranchName(input.name),
    );
    if (!row) {
      return err("branch_not_found");
    }
    if (row.isDefault) {
      return err("cannot_delete_default");
    }

    const [child] = await this.database
      .select({ id: schema.projectBranches.id })
      .from(schema.projectBranches)
      .where(
        and(
          eq(schema.projectBranches.baseBranchId, row.id),
          eq(schema.projectBranches.status, "active"),
        ),
      )
      .limit(1);
    if (child) {
      return err("cannot_delete_with_children");
    }

    await this.database.transaction(async (tx) => {
      await tx
        .delete(schema.projectTranslationKeys)
        .where(
          and(
            eq(schema.projectTranslationKeys.projectId, input.projectId),
            eq(schema.projectTranslationKeys.branchName, row.name),
            isNull(schema.projectTranslationKeys.repositorySourceFileId),
          ),
        );
      await tx
        .delete(schema.repositorySourceFiles)
        .where(
          and(
            eq(schema.repositorySourceFiles.projectId, input.projectId),
            eq(schema.repositorySourceFiles.branchName, row.name),
          ),
        );
      await tx.delete(schema.projectBranches).where(eq(schema.projectBranches.id, row.id));
    });
    return ok(undefined);
  }

  async previewMerge(input: {
    projectId: string;
    sourceName: string;
    targetName?: string | null;
  }): Promise<Result<{ changes: ProjectBranchMergeChange[] }, ProjectBranchErrorCode>> {
    const source = await this.findActiveByName(
      input.projectId,
      normalizeProjectBranchName(input.sourceName),
    );
    if (!source) {
      return err("branch_not_found");
    }
    const targetName = input.targetName
      ? normalizeProjectBranchName(input.targetName)
      : source.baseBranchId
        ? (await this.findById(source.baseBranchId))?.name
        : DEFAULT_PROJECT_BRANCH_NAME;
    if (!targetName) {
      return err("branch_not_found");
    }
    if (targetName === source.name) {
      return err("cannot_merge_into_self");
    }
    const target = await this.findActiveByName(input.projectId, targetName);
    if (!target) {
      return err("branch_not_found");
    }

    const changes = await diffBranchKeys(this.database, {
      projectId: input.projectId,
      sourceBranchName: source.name,
      targetBranchName: target.name,
    });
    return ok({ changes });
  }

  async merge(input: {
    projectId: string;
    sourceName: string;
    targetName?: string | null;
    strategy: ProjectBranchConflictStrategy;
    deleteAfter?: boolean;
  }): Promise<Result<ProjectBranchRecord, ProjectBranchErrorCode>> {
    const preview = await this.previewMerge(input);
    if (isErr(preview)) {
      return err(preview.error);
    }

    const source = await this.findActiveByName(
      input.projectId,
      normalizeProjectBranchName(input.sourceName),
    );
    const targetName = input.targetName
      ? normalizeProjectBranchName(input.targetName)
      : source?.baseBranchId
        ? (await this.findById(source.baseBranchId))?.name
        : DEFAULT_PROJECT_BRANCH_NAME;
    if (!source || !targetName) {
      return err("branch_not_found");
    }
    const target = await this.findActiveByName(input.projectId, targetName);
    if (!target) {
      return err("branch_not_found");
    }

    const [child] = await this.database
      .select({ id: schema.projectBranches.id })
      .from(schema.projectBranches)
      .where(
        and(
          eq(schema.projectBranches.baseBranchId, source.id),
          eq(schema.projectBranches.status, "active"),
        ),
      )
      .limit(1);
    if (child) {
      return err("has_child_branches");
    }

    await this.database.transaction(async (tx) => {
      await applyBranchChanges(tx, {
        organizationId: source.organizationId,
        projectId: input.projectId,
        sourceBranchName: source.name,
        targetBranchName: target.name,
        changes: preview.value.changes,
        strategy: input.strategy,
      });
      await tx
        .update(schema.projectBranches)
        .set({
          status: "merged",
          mergedAt: new Date(),
          mergedIntoBranchId: target.id,
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.projectBranches.id, source.id));
      if (input.deleteAfter !== false) {
        await tx
          .delete(schema.projectTranslationKeys)
          .where(
            and(
              eq(schema.projectTranslationKeys.projectId, input.projectId),
              eq(schema.projectTranslationKeys.branchName, source.name),
              isNull(schema.projectTranslationKeys.repositorySourceFileId),
            ),
          );
        await tx
          .delete(schema.repositorySourceFiles)
          .where(
            and(
              eq(schema.repositorySourceFiles.projectId, input.projectId),
              eq(schema.repositorySourceFiles.branchName, source.name),
            ),
          );
      }
    });

    const counts = await this.countByBranchName(input.projectId, target.name);
    const refreshed = await this.findById(target.id);
    if (!refreshed) {
      return err("branch_not_found");
    }
    return ok(toRecord(refreshed, counts.get(target.name) ?? { fileCount: 0, keyCount: 0 }));
  }

  async sync(input: {
    projectId: string;
    name: string;
    strategy: ProjectBranchConflictStrategy;
  }): Promise<Result<ProjectBranchRecord, ProjectBranchErrorCode>> {
    const branch = await this.findActiveByName(
      input.projectId,
      normalizeProjectBranchName(input.name),
    );
    if (!branch) {
      return err("branch_not_found");
    }
    if (!branch.baseBranchId) {
      return err("branch_not_found");
    }
    const base = await this.findById(branch.baseBranchId);
    if (!base || base.status !== "active") {
      return err("branch_not_found");
    }

    const changes = await diffBranchKeys(this.database, {
      projectId: input.projectId,
      sourceBranchName: base.name,
      targetBranchName: branch.name,
    });

    await this.database.transaction(async (tx) => {
      await applyBranchChanges(tx, {
        organizationId: branch.organizationId,
        projectId: input.projectId,
        sourceBranchName: base.name,
        targetBranchName: branch.name,
        changes,
        strategy: input.strategy,
      });
      await tx
        .update(schema.projectBranches)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.projectBranches.id, branch.id));
    });

    const counts = await this.countByBranchName(input.projectId, branch.name);
    const refreshed = await this.findById(branch.id);
    if (!refreshed) {
      return err("branch_not_found");
    }
    return ok(toRecord(refreshed, counts.get(branch.name) ?? { fileCount: 0, keyCount: 0 }));
  }

  async assertWritable(input: {
    projectId: string;
    branchName?: string | null;
  }): Promise<Result<string, ProjectBranchErrorCode>> {
    const name = normalizeProjectBranchName(input.branchName || DEFAULT_PROJECT_BRANCH_NAME);
    const row = await this.findActiveByName(input.projectId, name);
    if (!row) {
      return err("branch_not_found");
    }
    if (row.isProtected) {
      return err("protected_branch");
    }
    return ok(row.name);
  }

  private async findActiveByName(projectId: string, name: string): Promise<BranchRow | null> {
    const [row] = await this.database
      .select()
      .from(schema.projectBranches)
      .where(
        and(
          eq(schema.projectBranches.projectId, projectId),
          eq(schema.projectBranches.name, name),
          eq(schema.projectBranches.status, "active"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async findById(id: string): Promise<BranchRow | null> {
    const [row] = await this.database
      .select()
      .from(schema.projectBranches)
      .where(eq(schema.projectBranches.id, id))
      .limit(1);
    return row ?? null;
  }

  private async resolveBaseBranch(
    projectId: string,
    name?: string | null,
  ): Promise<BranchRow | null> {
    if (name?.trim()) {
      return this.findActiveByName(projectId, normalizeProjectBranchName(name));
    }
    const [defaultRow] = await this.database
      .select()
      .from(schema.projectBranches)
      .where(
        and(
          eq(schema.projectBranches.projectId, projectId),
          eq(schema.projectBranches.isDefault, true),
          eq(schema.projectBranches.status, "active"),
        ),
      )
      .limit(1);
    if (defaultRow) {
      return defaultRow;
    }
    return this.findActiveByName(projectId, DEFAULT_PROJECT_BRANCH_NAME);
  }

  private async countByBranchName(
    projectId: string,
    branchName?: string,
  ): Promise<Map<string, { fileCount: number; keyCount: number }>> {
    const fileRows = await this.database
      .select({
        branchName: schema.repositorySourceFiles.branchName,
        fileCount: sql<number>`count(*)::int`,
      })
      .from(schema.repositorySourceFiles)
      .where(
        branchName
          ? and(
              eq(schema.repositorySourceFiles.projectId, projectId),
              eq(schema.repositorySourceFiles.branchName, branchName),
            )
          : eq(schema.repositorySourceFiles.projectId, projectId),
      )
      .groupBy(schema.repositorySourceFiles.branchName);

    const keyRows = await this.database
      .select({
        branchName: schema.projectTranslationKeys.branchName,
        keyCount: sql<number>`count(*)::int`,
      })
      .from(schema.projectTranslationKeys)
      .where(
        branchName
          ? and(
              eq(schema.projectTranslationKeys.projectId, projectId),
              eq(schema.projectTranslationKeys.branchName, branchName),
            )
          : eq(schema.projectTranslationKeys.projectId, projectId),
      )
      .groupBy(schema.projectTranslationKeys.branchName);

    const counts = new Map<string, { fileCount: number; keyCount: number }>();
    for (const row of fileRows) {
      counts.set(row.branchName, { fileCount: Number(row.fileCount), keyCount: 0 });
    }
    for (const row of keyRows) {
      const current = counts.get(row.branchName) ?? { fileCount: 0, keyCount: 0 };
      current.keyCount = Number(row.keyCount);
      counts.set(row.branchName, current);
    }
    return counts;
  }
}

export const projectBranchService = new ProjectBranchService();

type KeySnapshot = {
  id: string;
  key: string;
  sourcePath: string | null;
  sourceText: string;
  context: string | null;
  type: string | null;
  maxLength: number | null;
  tags: string[];
  isHidden: boolean;
  translations: ProjectBranchMergeTranslation[];
};

async function loadKeySnapshots(
  database: DatabaseClient,
  projectId: string,
  branchName: string,
): Promise<KeySnapshot[]> {
  const keys = await database
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
      context: schema.projectTranslationKeys.context,
      type: schema.projectTranslationKeys.type,
      maxLength: schema.projectTranslationKeys.maxLength,
      tags: schema.projectTranslationKeys.tags,
      isHidden: schema.projectTranslationKeys.isHidden,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.projectTranslationKeys)
    .leftJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, projectId),
        eq(schema.projectTranslationKeys.branchName, branchName),
      ),
    );

  if (keys.length === 0) {
    return [];
  }

  const translations = await database
    .select({
      translationKeyId: schema.projectTranslations.translationKeyId,
      locale: schema.projectTranslations.targetLocale,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
    })
    .from(schema.projectTranslations)
    .where(
      inArray(
        schema.projectTranslations.translationKeyId,
        keys.map((key) => key.id),
      ),
    );

  const translationsByKey = new Map<string, ProjectBranchMergeTranslation[]>();
  for (const translation of translations) {
    const list = translationsByKey.get(translation.translationKeyId) ?? [];
    list.push({
      locale: translation.locale,
      text: translation.text,
      status: translation.status,
    });
    translationsByKey.set(translation.translationKeyId, list);
  }

  return keys.map((key) => ({
    id: key.id,
    key: key.key,
    sourcePath: key.sourcePath,
    sourceText: key.sourceText,
    context: key.context,
    type: key.type,
    maxLength: key.maxLength,
    tags: key.tags,
    isHidden: key.isHidden,
    translations: translationsByKey.get(key.id) ?? [],
  }));
}

function keyIdentity(snapshot: { sourcePath: string | null; key: string }) {
  return `${snapshot.sourcePath ?? ""}::${snapshot.key}`;
}

function translationsEqual(
  left: readonly ProjectBranchMergeTranslation[],
  right: readonly ProjectBranchMergeTranslation[],
) {
  if (left.length !== right.length) {
    return false;
  }
  const rightByLocale = new Map(right.map((item) => [item.locale, item]));
  return left.every((item) => {
    const match = rightByLocale.get(item.locale);
    return match != null && match.text === item.text && match.status === item.status;
  });
}

async function diffBranchKeys(
  database: DatabaseClient,
  input: { projectId: string; sourceBranchName: string; targetBranchName: string },
): Promise<ProjectBranchMergeChange[]> {
  const [sourceKeys, targetKeys] = await Promise.all([
    loadKeySnapshots(database, input.projectId, input.sourceBranchName),
    loadKeySnapshots(database, input.projectId, input.targetBranchName),
  ]);
  const targetById = new Map(targetKeys.map((key) => [keyIdentity(key), key]));
  const changes: ProjectBranchMergeChange[] = [];

  for (const source of sourceKeys) {
    const target = targetById.get(keyIdentity(source));
    if (!target) {
      changes.push({
        kind: "added",
        sourcePath: source.sourcePath,
        key: source.key,
        sourceText: source.sourceText,
        targetSourceText: null,
        translations: source.translations,
      });
      continue;
    }
    const sourceChanged = source.sourceText !== target.sourceText;
    const translationChanged = !translationsEqual(source.translations, target.translations);
    if (!sourceChanged && !translationChanged) {
      continue;
    }
    changes.push({
      kind: sourceChanged ? "conflicted" : "changed",
      sourcePath: source.sourcePath,
      key: source.key,
      sourceText: source.sourceText,
      targetSourceText: target.sourceText,
      translations: source.translations,
    });
  }

  return changes;
}

async function copyBranchContent(
  tx: DatabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    fromBranchName: string;
    toBranchName: string;
  },
) {
  const files = await tx
    .select()
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.branchName, input.fromBranchName),
      ),
    );

  const fileIdBySource = new Map<string, string>();
  if (files.length > 0) {
    const inserted = await tx
      .insert(schema.repositorySourceFiles)
      .values(
        files.map((file) => ({
          organizationId: file.organizationId,
          projectId: file.projectId,
          sourcePath: file.sourcePath,
          branchName: input.toBranchName,
          segmentationSettings: file.segmentationSettings,
          messageFormat: file.messageFormat,
          placeholderPatterns: file.placeholderPatterns,
          importSettings: file.importSettings,
        })),
      )
      .returning({
        id: schema.repositorySourceFiles.id,
        sourcePath: schema.repositorySourceFiles.sourcePath,
      });

    for (const file of inserted) {
      fileIdBySource.set(file.sourcePath, file.id);
    }

    const sourceFileIds = files.map((file) => file.id);
    const versions = await tx
      .select()
      .from(schema.repositorySourceFileVersions)
      .where(inArray(schema.repositorySourceFileVersions.repositorySourceFileId, sourceFileIds))
      .orderBy(desc(schema.repositorySourceFileVersions.createdAt));

    const latestByFile = new Map<string, (typeof versions)[number]>();
    for (const version of versions) {
      if (!latestByFile.has(version.repositorySourceFileId)) {
        latestByFile.set(version.repositorySourceFileId, version);
      }
    }

    const versionRows = files.flatMap((file) => {
      const latest = latestByFile.get(file.id);
      const clonedFileId = fileIdBySource.get(file.sourcePath);
      if (!latest || !clonedFileId) {
        return [];
      }
      return [
        {
          repositorySourceFileId: clonedFileId,
          organizationId: latest.organizationId,
          projectId: latest.projectId,
          sourcePath: latest.sourcePath,
          storedFileId: latest.storedFileId,
          sourceHash: latest.sourceHash,
          commitSha: latest.commitSha,
          workflowRunId: latest.workflowRunId,
          ingestState: latest.ingestState,
          ingestError: latest.ingestError,
          ingestedAt: latest.ingestedAt,
          keepApprovedTranslations: latest.keepApprovedTranslations,
          uploadSurface: latest.uploadSurface,
        },
      ];
    });
    if (versionRows.length > 0) {
      await tx.insert(schema.repositorySourceFileVersions).values(versionRows);
    }
  }

  const keys = await tx
    .select()
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.branchName, input.fromBranchName),
      ),
    );
  if (keys.length === 0) {
    return;
  }

  const pathByFileId = new Map(files.map((file) => [file.id, file.sourcePath]));
  const insertedKeys = await tx
    .insert(schema.projectTranslationKeys)
    .values(
      keys.map((key) => ({
        organizationId: key.organizationId,
        projectId: key.projectId,
        repositorySourceFileId: key.repositorySourceFileId
          ? (fileIdBySource.get(pathByFileId.get(key.repositorySourceFileId) ?? "") ?? null)
          : null,
        key: key.key,
        branchName: input.toBranchName,
        sourceText: key.sourceText,
        normalizedSourceText: key.normalizedSourceText,
        importedSourceText: key.importedSourceText,
        context: key.context,
        type: key.type,
        maxLength: key.maxLength,
        tags: key.tags,
        designUrl: key.designUrl,
        isHidden: key.isHidden,
        metadata: key.metadata,
      })),
    )
    .returning({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      repositorySourceFileId: schema.projectTranslationKeys.repositorySourceFileId,
    });

  const newKeyByIdentity = new Map(
    insertedKeys.map((key) => [`${key.repositorySourceFileId ?? ""}::${key.key}`, key.id]),
  );
  const oldToNewKey = new Map<string, string>();
  for (const key of keys) {
    const mapped = newKeyByIdentity.get(
      `${key.repositorySourceFileId ? (fileIdBySource.get(pathByFileId.get(key.repositorySourceFileId) ?? "") ?? "") : ""}::${key.key}`,
    );
    if (mapped) {
      oldToNewKey.set(key.id, mapped);
    }
  }

  const translations = await tx
    .select()
    .from(schema.projectTranslations)
    .where(
      inArray(
        schema.projectTranslations.translationKeyId,
        keys.map((key) => key.id),
      ),
    );
  const translationRows = translations.flatMap((translation) => {
    const translationKeyId = oldToNewKey.get(translation.translationKeyId);
    if (!translationKeyId) {
      return [];
    }
    return [
      {
        organizationId: translation.organizationId,
        projectId: translation.projectId,
        translationKeyId,
        targetLocale: translation.targetLocale,
        text: translation.text,
        status: translation.status,
        provenance: translation.provenance,
        origin: translation.origin,
        metadata: translation.metadata,
      },
    ];
  });
  if (translationRows.length > 0) {
    await tx.insert(schema.projectTranslations).values(translationRows);
  }
}

async function applyBranchChanges(
  tx: DatabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    sourceBranchName: string;
    targetBranchName: string;
    changes: readonly ProjectBranchMergeChange[];
    strategy: ProjectBranchConflictStrategy;
  },
) {
  const accepted = input.changes.filter((change) => {
    if (change.kind === "conflicted") {
      return input.strategy === "use_branch";
    }
    return true;
  });
  if (accepted.length === 0) {
    return;
  }

  const sourceKeys = await loadKeySnapshots(tx, input.projectId, input.sourceBranchName);
  const sourceByIdentity = new Map(sourceKeys.map((key) => [keyIdentity(key), key]));

  const files = await tx
    .select()
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.branchName, input.targetBranchName),
      ),
    );
  const fileIdByPath = new Map(files.map((file) => [file.sourcePath, file.id]));

  for (const change of accepted) {
    const snapshot = sourceByIdentity.get(keyIdentity(change));
    if (!snapshot) {
      continue;
    }
    let fileId: string | null = null;
    if (change.sourcePath) {
      fileId = fileIdByPath.get(change.sourcePath) ?? null;
      if (!fileId) {
        const [createdFile] = await tx
          .insert(schema.repositorySourceFiles)
          .values({
            organizationId: input.organizationId,
            projectId: input.projectId,
            sourcePath: change.sourcePath,
            branchName: input.targetBranchName,
          })
          .returning({ id: schema.repositorySourceFiles.id });
        if (createdFile) {
          fileId = createdFile.id;
          fileIdByPath.set(change.sourcePath, fileId);
          const [sourceFile] = await tx
            .select()
            .from(schema.repositorySourceFiles)
            .where(
              and(
                eq(schema.repositorySourceFiles.projectId, input.projectId),
                eq(schema.repositorySourceFiles.branchName, input.sourceBranchName),
                eq(schema.repositorySourceFiles.sourcePath, change.sourcePath),
              ),
            )
            .limit(1);
          if (sourceFile) {
            const [latest] = await tx
              .select()
              .from(schema.repositorySourceFileVersions)
              .where(eq(schema.repositorySourceFileVersions.repositorySourceFileId, sourceFile.id))
              .orderBy(desc(schema.repositorySourceFileVersions.createdAt))
              .limit(1);
            if (latest) {
              await tx.insert(schema.repositorySourceFileVersions).values({
                repositorySourceFileId: fileId,
                organizationId: latest.organizationId,
                projectId: latest.projectId,
                sourcePath: latest.sourcePath,
                storedFileId: latest.storedFileId,
                sourceHash: latest.sourceHash,
                ingestState: latest.ingestState,
              });
            }
          }
        }
      }
    }

    const [existing] = await tx
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.branchName, input.targetBranchName),
          eq(schema.projectTranslationKeys.key, snapshot.key),
          fileId
            ? eq(schema.projectTranslationKeys.repositorySourceFileId, fileId)
            : isNull(schema.projectTranslationKeys.repositorySourceFileId),
        ),
      )
      .limit(1);

    let keyId = existing?.id;
    if (!keyId) {
      const [created] = await tx
        .insert(schema.projectTranslationKeys)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          repositorySourceFileId: fileId,
          key: snapshot.key,
          branchName: input.targetBranchName,
          sourceText: snapshot.sourceText,
          normalizedSourceText: snapshot.sourceText,
          context: snapshot.context,
          type: snapshot.type,
          maxLength: snapshot.maxLength,
          tags: snapshot.tags,
          isHidden: snapshot.isHidden,
        })
        .returning({ id: schema.projectTranslationKeys.id });
      keyId = created?.id;
    } else {
      await tx
        .update(schema.projectTranslationKeys)
        .set({
          sourceText: snapshot.sourceText,
          normalizedSourceText: snapshot.sourceText,
          context: snapshot.context,
          type: snapshot.type,
          maxLength: snapshot.maxLength,
          tags: snapshot.tags,
          isHidden: snapshot.isHidden,
          updatedAt: new Date(),
        })
        .where(eq(schema.projectTranslationKeys.id, keyId));
    }
    if (!keyId) {
      continue;
    }

    for (const translation of snapshot.translations) {
      await tx
        .insert(schema.projectTranslations)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          translationKeyId: keyId,
          targetLocale: translation.locale,
          text: translation.text,
          status:
            translation.status as (typeof schema.projectTranslationStatusEnum.enumValues)[number],
        })
        .onConflictDoUpdate({
          target: [
            schema.projectTranslations.translationKeyId,
            schema.projectTranslations.targetLocale,
          ],
          set: {
            text: translation.text,
            status:
              translation.status as (typeof schema.projectTranslationStatusEnum.enumValues)[number],
            updatedAt: new Date(),
          },
        });
    }
  }
}
