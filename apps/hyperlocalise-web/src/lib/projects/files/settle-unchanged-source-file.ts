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
 * found the file unchanged. The file's text is known for every key the file has: the clash
 * list keeps it, and otherwise it is the text last imported. Those keys go through the same
 * three-way rule as an import, so a clash someone settled in the platform stops being one, a
 * platform text put back to the base takes the file's text, and with source text kept to the
 * repository an edit made here is replaced. Returns the clashes still standing.
 */
export async function settleUnchangedSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  sourceTextEditable: boolean;
}): Promise<SourceFileSyncClash[]> {
  return db.transaction(async (tx) => {
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

    // Keys the file has: those its last import wrote, and not hidden since.
    const present = and(
      eq(schema.projectTranslationKeys.repositorySourceFileId, file.id),
      eq(schema.projectTranslationKeys.sourceFileVersionId, file.versionId),
      eq(schema.projectTranslationKeys.isHidden, false),
    );
    const fileTextByKey = new Map<string, string>();
    if (input.sourceTextEditable) {
      for (const clash of file.syncReport?.clashes ?? []) {
        fileTextByKey.set(clash.key, clash.fileText);
      }
    } else {
      const drifted = await tx
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
        fileTextByKey.set(row.key, row.importedSourceText ?? "");
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
      return [];
    }
    const { clashes } = await new ProjectTranslationService().upsertKeysFromEntries(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: file.id,
        sourceFileVersionId: file.versionId,
        preserveEmptySourceText: true,
        sourceTextEditable: input.sourceTextEditable,
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
    await tx
      .update(schema.repositorySourceFileVersions)
      .set({ syncReport: { clashes, missingKeys: file.syncReport?.missingKeys ?? [] } })
      .where(eq(schema.repositorySourceFileVersions.id, file.versionId));
    return clashes;
  });
}
