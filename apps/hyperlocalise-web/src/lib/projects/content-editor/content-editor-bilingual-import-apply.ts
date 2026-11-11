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
import "server-only";

import { enqueueFileTranslationsImportedActivity } from "@/lib/activity-log/file-segment-events";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";

import {
  groupCatBilingualImportEntries,
  type CatBilingualImportCounts,
} from "./content-editor-bilingual-import";
import {
  maxCatFilteredExportSegments,
  type ContentEditorFilteredExportRow,
} from "./content-editor-filtered-export";

export async function importCatBilingualRows(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  rows: readonly ContentEditorFilteredExportRow[];
  actorUserId?: string | null;
}): Promise<CatBilingualImportCounts> {
  if (input.rows.length > maxCatFilteredExportSegments) {
    throw new Error("too many rows");
  }

  const grouped = groupCatBilingualImportEntries({
    rows: input.rows,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });

  let matched = 0;
  let imported = 0;
  let skipped = grouped.skipped;

  for (const [sourcePath, entries] of grouped.entriesByPath) {
    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      targetLocale: input.targetLocale,
      entries,
      actorUserId: input.actorUserId ?? null,
    });
    matched += result.matched;
    imported += result.imported;
    skipped += result.skipped;
    if (result.imported > 0) {
      await enqueueFileTranslationsImportedActivity({
        actorKind: input.actorUserId ? "user" : "system",
        actorUserId: input.actorUserId ?? null,
        actorCredentialId: null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath,
        targetLocale: input.targetLocale,
      });
    }
  }

  return { matched, imported, skipped, files: grouped.entriesByPath.size };
}
