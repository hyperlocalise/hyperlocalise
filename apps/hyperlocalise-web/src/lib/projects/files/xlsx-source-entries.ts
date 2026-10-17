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

import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database/client";
import { getStoredFileContent } from "@/lib/file-storage/records";
import { entriesFromHlOutput, type HlEntriesPayload } from "@/lib/projects/files/hl-entries";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  loadXlsxWorkbook,
  readXlsxEntries,
  type XlsxEntry,
  type XlsxWorkbookError,
} from "@/lib/translation/xlsx/xlsx-workbook";

export type ProjectXlsxEntriesError =
  | XlsxWorkbookError
  | { code: "project_not_found" }
  | { code: "source_content_not_found" };

/** The project source locale that picks the source column of multilingual sheets. */
export async function getProjectSourceLocale(input: {
  organizationId: string;
  projectId: string;
}): Promise<Result<string | null, { code: "project_not_found" }>> {
  const [project] = await db
    .select({ sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return project ? ok(project.sourceLocale) : err({ code: "project_not_found" });
}

async function loadStoredWorkbookEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  locale: (sourceLocale: string | null) => string;
}): Promise<Result<XlsxEntry[], ProjectXlsxEntriesError>> {
  const sourceLocale = await getProjectSourceLocale(input);
  if (isErr(sourceLocale)) {
    return sourceLocale;
  }
  const stored = await fromThrowableAsync(
    getStoredFileContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: input.storedFileId,
    }),
  );
  if (isErr(stored)) {
    return err({ code: "source_content_not_found" });
  }
  const workbook = await loadXlsxWorkbook(stored.value.content);
  if (isErr(workbook)) {
    return workbook;
  }
  return ok(readXlsxEntries(workbook.value, sourceLocale.value, input.locale(sourceLocale.value)));
}

/**
 * Source segments of a stored `.xlsx` upload. Comments become segment context and
 * length-limit columns become max lengths, as in the CLI.
 */
export async function loadProjectXlsxSourceEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
}): Promise<Result<ProjectSourceStringEntry[], ProjectXlsxEntriesError>> {
  const entries = await loadStoredWorkbookEntries({
    ...input,
    locale: (sourceLocale) => sourceLocale ?? "",
  });
  if (isErr(entries)) {
    return entries;
  }
  const payload: HlEntriesPayload = {};
  for (const entry of entries.value) {
    payload[entry.key] = {
      text: entry.text,
      ...(entry.maxLength > 0 ? { maxLength: entry.maxLength } : {}),
      ...(entry.comment ? { context: entry.comment } : {}),
    };
  }
  return ok(entriesFromHlOutput(payload, true));
}

/**
 * `targetLocale` translations in a stored `.xlsx`, keyed like its source segments.
 * Multilingual sheets read the target column; cell-layout sheets are read in place, so the
 * upload is expected to be the translated copy of the workbook.
 */
export async function loadProjectXlsxTargetEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  targetLocale: string;
}): Promise<Result<Record<string, string>, ProjectXlsxEntriesError>> {
  const entries = await loadStoredWorkbookEntries({
    ...input,
    locale: () => input.targetLocale,
  });
  if (isErr(entries)) {
    return entries;
  }
  return ok(Object.fromEntries(entries.value.map((entry) => [entry.key, entry.text])));
}
