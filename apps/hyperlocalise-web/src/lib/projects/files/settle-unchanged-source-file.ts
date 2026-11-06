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
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import type { SourceFileSyncClash } from "./source-file-sync-report";

/**
 * Brings a synced file's keys in line with the file without importing it again, for a run that
 * found the file unchanged. The file's text is known for every key the file has: the clash list
 * keeps it, and otherwise it is the text last imported. Those keys go through the same three-way
 * rule as an import, so a clash someone settled in the platform stops being one, a platform text
 * put back to the base takes the file's text, and with the setting off an edit made here is
 * replaced. Returns the clashes still standing.
 */
export async function settleUnchangedSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<SourceFileSyncClash[]> {
  if (!(await mayNeedSettling(input))) {
    return [];
  }
  return db.transaction(async (tx) => {
    // The same lock an import takes, so a settle and an ingest of the file never interleave.
    const [file] = await tx
      .select({
        id: schema.repositorySourceFiles.id,
        versionId: schema.repositorySourceFileVersions.id,
        syncReport: schema.repositorySourceFileVersions.syncReport,
      })
      .from(schema.repositorySourceFiles)
      .innerJoin(
        schema.repositorySourceFileVersions,
        eq(
          schema.repositorySourceFileVersions.id,
          schema.repositorySourceFiles.reconciledSourceFileVersionId,
        ),
      )
      .where(
        and(
          eq(schema.repositorySourceFiles.organizationId, input.organizationId),
          eq(schema.repositorySourceFiles.projectId, input.projectId),
          eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
        ),
      )
      .for("update", { of: schema.repositorySourceFiles })
      .limit(1);
    if (!file) {
      return [];
    }
    const [project] = await tx
      .select({
        approvedTranslationsOnSourceChange: schema.projects.approvedTranslationsOnSourceChange,
        sourceTextEditable: schema.projects.sourceTextEditable,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      );
    if (!project) {
      return [];
    }

    // Keys the file has: those its last import wrote.
    const present = and(
      eq(schema.projectTranslationKeys.repositorySourceFileId, file.id),
      eq(schema.projectTranslationKeys.sourceFileVersionId, file.versionId),
    );
    // A clash keeps its base, so its file text comes from the report in either mode.
    const fileTextByKey = new Map<string, string>();
    for (const clash of file.syncReport?.clashes ?? []) {
      fileTextByKey.set(clash.key, clash.fileText);
    }
    // With the setting off, any other key whose text moved off the last import takes the file's
    // text back; with it on, such a key is an edit made here, which the rule would keep anyway.
    const drifted = project.sourceTextEditable
      ? []
      : await tx
          .select({
            key: schema.projectTranslationKeys.key,
            importedSourceText: schema.projectTranslationKeys.importedSourceText,
          })
          .from(schema.projectTranslationKeys)
          .where(
            and(
              present,
              isNotNull(schema.projectTranslationKeys.importedSourceText),
              sql`${schema.projectTranslationKeys.sourceText} IS DISTINCT FROM ${schema.projectTranslationKeys.importedSourceText}`,
            ),
          );
    for (const row of drifted) {
      if (!fileTextByKey.has(row.key) && row.importedSourceText !== null) {
        fileTextByKey.set(row.key, row.importedSourceText);
      }
    }
    if (fileTextByKey.size === 0) {
      return [];
    }

    const keys = await tx
      .select({
        key: schema.projectTranslationKeys.key,
        context: schema.projectTranslationKeys.context,
        type: schema.projectTranslationKeys.type,
        maxLength: schema.projectTranslationKeys.maxLength,
      })
      .from(schema.projectTranslationKeys)
      .where(and(present, inArray(schema.projectTranslationKeys.key, [...fileTextByKey.keys()])));
    if (keys.length === 0) {
      // The clashing strings are gone: drop the list, so the next run doesn't look again.
      if (file.syncReport?.clashes) {
        const { clashes: _gone, ...rest } = file.syncReport;
        await tx
          .update(schema.repositorySourceFileVersions)
          .set({ syncReport: rest })
          .where(eq(schema.repositorySourceFileVersions.id, file.versionId));
      }
      return [];
    }
    const { clashes } = await new ProjectTranslationService().upsertKeysFromEntries(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: file.id,
        sourceFileVersionId: file.versionId,
        preserveEmptySourceText: true,
        // A sync has no person to choose the small-fix skip.
        sendApprovedToReviewOnSourceChange:
          project.approvedTranslationsOnSourceChange === "needs_review",
        sourceTextEditable: project.sourceTextEditable,
        entries: keys.map((row) => ({
          key: row.key,
          text: fileTextByKey.get(row.key) ?? "",
          context: row.context,
          type: row.type ?? undefined,
          ...(row.maxLength === null ? {} : { maxLength: row.maxLength }),
        })),
      },
      tx,
    );
    const { clashes: _previous, ...rest } = file.syncReport ?? { missingKeys: [] };
    await tx
      .update(schema.repositorySourceFileVersions)
      .set({ syncReport: { ...rest, ...(clashes.length > 0 ? { clashes } : {}) } })
      .where(eq(schema.repositorySourceFileVersions.id, file.versionId));
    return clashes;
  });
}

/**
 * A cheap look, without locks, at whether the file has anything to settle: a standing clash, or
 * with the setting off a key edited here. Most runs find nothing, so most files take no lock.
 */
async function mayNeedSettling(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<boolean> {
  const [file] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      versionId: schema.repositorySourceFiles.reconciledSourceFileVersionId,
      syncReport: schema.repositorySourceFileVersions.syncReport,
      sourceTextEditable: schema.projects.sourceTextEditable,
    })
    .from(schema.repositorySourceFiles)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.repositorySourceFiles.projectId))
    .innerJoin(
      schema.repositorySourceFileVersions,
      eq(
        schema.repositorySourceFileVersions.id,
        schema.repositorySourceFiles.reconciledSourceFileVersionId,
      ),
    )
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    )
    .limit(1);
  if (!file) {
    return false;
  }
  if ((file.syncReport?.clashes?.length ?? 0) > 0) {
    return true;
  }
  if (file.sourceTextEditable || !file.versionId) {
    return false;
  }
  const [drifted] = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.repositorySourceFileId, file.id),
        eq(schema.projectTranslationKeys.sourceFileVersionId, file.versionId),
        isNotNull(schema.projectTranslationKeys.importedSourceText),
        sql`${schema.projectTranslationKeys.sourceText} IS DISTINCT FROM ${schema.projectTranslationKeys.importedSourceText}`,
      ),
    )
    .limit(1);
  return drifted !== undefined;
}
