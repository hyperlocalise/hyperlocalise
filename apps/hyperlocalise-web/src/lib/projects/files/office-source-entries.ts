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
  inferSupportedOfficeTranslationFileFormat,
  type SupportedOfficeTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import type { OoxmlEntry } from "@/lib/translation/ooxml/ooxml-paragraph";
import type { OoxmlError } from "@/lib/translation/ooxml/ooxml-tree";
import { readPptxEntries } from "@/lib/translation/ooxml/pptx-deck";
import { spreadsheetXlsxContent } from "@/lib/translation/xlsx/xls-workbook";
import {
  loadXlsxWorkbook,
  readXlsxEntries,
  type XlsxEntry,
  type XlsxWorkbookError,
} from "@/lib/translation/xlsx/xlsx-workbook";

export type ProjectOfficeEntriesError =
  | XlsxWorkbookError
  | OoxmlError
  | { code: "unsupported_office_format" }
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

type StoredOfficeFile = {
  format: SupportedOfficeTranslationFileFormat;
  content: Uint8Array;
};

async function loadStoredOfficeFile(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
}): Promise<Result<StoredOfficeFile, ProjectOfficeEntriesError>> {
  const format = inferSupportedOfficeTranslationFileFormat(input.sourcePath);
  if (!format) {
    return err({ code: "unsupported_office_format" });
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
  return ok({ format, content: stored.value.content });
}

async function readWorkbookEntries(
  file: StoredOfficeFile,
  sourceLocale: string | null,
  locale: string,
): Promise<Result<XlsxEntry[], XlsxWorkbookError>> {
  const content = spreadsheetXlsxContent(file.content);
  if (isErr(content)) {
    return content;
  }
  const workbook = await loadXlsxWorkbook(content.value);
  if (isErr(workbook)) {
    return workbook;
  }
  return ok(readXlsxEntries(workbook.value, sourceLocale, locale));
}

function readParagraphEntries(file: StoredOfficeFile): Promise<Result<OoxmlEntry[], OoxmlError>> {
  return file.format === "docx" ? readDocxEntries(file.content) : readPptxEntries(file.content);
}

/**
 * Source segments of a stored Office upload, keyed like the CLI keys them. Workbook
 * comments and length-limit columns become context and max lengths; document and slide
 * paragraphs carry their location and style as context.
 */
export async function loadProjectOfficeSourceEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
}): Promise<Result<ProjectSourceStringEntry[], ProjectOfficeEntriesError>> {
  const file = await loadStoredOfficeFile(input);
  if (isErr(file)) {
    return file;
  }

  const payload: HlEntriesPayload = {};
  if (file.value.format === "xlsx" || file.value.format === "xls") {
    const sourceLocale = await getProjectSourceLocale(input);
    if (isErr(sourceLocale)) {
      return sourceLocale;
    }
    const entries = await readWorkbookEntries(
      file.value,
      sourceLocale.value,
      sourceLocale.value ?? "",
    );
    if (isErr(entries)) {
      return entries;
    }
    for (const entry of entries.value) {
      payload[entry.key] = {
        text: entry.text,
        ...(entry.maxLength > 0 ? { maxLength: entry.maxLength } : {}),
        ...(entry.comment ? { context: entry.comment } : {}),
      };
    }
  } else {
    const entries = await readParagraphEntries(file.value);
    if (isErr(entries)) {
      return entries;
    }
    for (const entry of entries.value) {
      payload[entry.key] = {
        text: entry.text,
        ...(entry.context ? { context: entry.context } : {}),
      };
    }
  }
  return ok(entriesFromHlOutput(payload, true));
}

/**
 * `targetLocale` translations in a stored Office upload, keyed like its source segments.
 * Multilingual sheets read the target column. Cell-layout sheets, documents, and decks are
 * read in place, so the upload is expected to be the translated copy of the source.
 */
export async function loadProjectOfficeTargetEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
  targetLocale: string;
}): Promise<Result<Record<string, string>, ProjectOfficeEntriesError>> {
  const file = await loadStoredOfficeFile(input);
  if (isErr(file)) {
    return file;
  }

  if (file.value.format === "xlsx" || file.value.format === "xls") {
    const sourceLocale = await getProjectSourceLocale(input);
    if (isErr(sourceLocale)) {
      return sourceLocale;
    }
    const entries = await readWorkbookEntries(file.value, sourceLocale.value, input.targetLocale);
    if (isErr(entries)) {
      return entries;
    }
    return ok(Object.fromEntries(entries.value.map((entry) => [entry.key, entry.text])));
  }

  const entries = await readParagraphEntries(file.value);
  if (isErr(entries)) {
    return entries;
  }
  return ok(Object.fromEntries(entries.value.map((entry) => [entry.key, entry.text])));
}
