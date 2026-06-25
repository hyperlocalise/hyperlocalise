import type { TranslationFileImportEventData } from "@/lib/workflow/types";
import {
  createSourceIngestSandboxStep,
  getStoredFileMetadataStep,
  prepareSourceIngestSandboxStep,
  stopSourceIngestSandboxStep,
  writeSourceIngestFileStep,
} from "./steps/source-file-ingest";
import { getStoredFileContentStep } from "./steps/translation-job";
import {
  extractTranslationImportEntriesStep,
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

    const entries = await extractTranslationImportEntriesStep({
      sandboxId,
      filePath: inputFilename,
      targetLocale: event.targetLocale,
    });

    const result = await importTranslationsFromEntriesStep({
      organizationId: event.organizationId,
      projectId: event.projectId,
      sourcePath: event.sourcePath,
      targetLocale: event.targetLocale,
      entries,
      actorUserId: event.actorUserId ?? null,
    });

    return {
      status: "imported" as const,
      matched: result.matched,
      imported: result.imported,
      skipped: result.skipped,
    };
  } finally {
    if (sandboxId) {
      await stopSourceIngestSandboxStep(sandboxId).catch(() => undefined);
    }
  }
}
