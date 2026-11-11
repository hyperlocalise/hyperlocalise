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
import {
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedSegmentedSpreadsheetTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { sandboxCliParsesOffice } from "@/lib/translation/sandbox-cli-version";
import type { TranslationFileImportEventData } from "@/lib/workflow/types";
import {
  createSourceIngestSandboxStep,
  getProjectSourceLocaleStep,
  getStoredFileMetadataStep,
  prepareSourceIngestSandboxStep,
  stopSourceIngestSandboxStep,
  writeSourceIngestFileStep,
} from "./steps/source-file-ingest";
import { getStoredFileContentStep } from "./steps/translation-job";
import {
  enqueueFileTranslationsImportedActivityStep,
  extractTranslationImportEntriesStep,
  extractOfficeTranslationImportEntriesStep,
  importTranslationsFromEntriesStep,
} from "./steps/translation-file-import";

function sanitizeSandboxFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

export async function translationFileImportWorkflow(event: TranslationFileImportEventData) {
  "use workflow";

  const officeFormat = inferSupportedOfficeTranslationFileFormat(event.sourcePath);
  const isSpreadsheet = Boolean(
    inferSupportedSegmentedSpreadsheetTranslationFileFormat(event.sourcePath),
  );
  // .xls sources download as .xlsx, so either may come back; the CLI reads neither as .xls.
  if (officeFormat && (officeFormat === "xls" || !sandboxCliParsesOffice())) {
    const entries = await extractOfficeTranslationImportEntriesStep({
      organizationId: event.organizationId,
      projectId: event.projectId,
      storedFileId: event.storedFileId,
      sourcePath: event.sourcePath,
      targetLocale: event.targetLocale,
    });
    return importAndRecord(event, entries);
  }

  let sandboxId: string | null = null;

  try {
    const [storedFile, content] = await Promise.all([
      getStoredFileMetadataStep(event.storedFileId, event.organizationId),
      getStoredFileContentStep(event.storedFileId, event.organizationId),
    ]);

    const inputFilename = sanitizeSandboxFilename(
      basename(event.sourcePath) || storedFile.filename,
    );
    ({ sandboxId } = await createSourceIngestSandboxStep());

    await prepareSourceIngestSandboxStep(sandboxId);
    await writeSourceIngestFileStep(sandboxId, inputFilename, content);

    const sourceLocale = isSpreadsheet
      ? await getProjectSourceLocaleStep({
          organizationId: event.organizationId,
          projectId: event.projectId,
        })
      : null;
    const extractedEntries = await extractTranslationImportEntriesStep({
      sandboxId,
      filePath: inputFilename,
      targetLocale: event.targetLocale,
      sourceLocale,
    });
    const { hlEntriesPayloadToStringMap } = await import("@/lib/projects/files/hl-entries");

    return await importAndRecord(event, hlEntriesPayloadToStringMap(extractedEntries));
  } finally {
    if (sandboxId) {
      await stopSourceIngestSandboxStep(sandboxId).catch(() => undefined);
    }
  }
}

async function importAndRecord(
  event: TranslationFileImportEventData,
  entries: Record<string, string>,
) {
  const result = await importTranslationsFromEntriesStep({
    organizationId: event.organizationId,
    projectId: event.projectId,
    sourcePath: event.sourcePath,
    targetLocale: event.targetLocale,
    entries,
    actorUserId: event.actorUserId ?? null,
  });

  await enqueueFileTranslationsImportedActivityStep({
    actorUserId: event.actorUserId ?? null,
    organizationId: event.organizationId,
    projectId: event.projectId,
    sourcePath: event.sourcePath,
    storedFileId: event.storedFileId,
    targetLocale: event.targetLocale,
  });

  return {
    status: "imported" as const,
    matched: result.matched,
    imported: result.imported,
    skipped: result.skipped,
  };
}
