import { getWorkflowMetadata } from "workflow";

import type { SourceFileIngestEventData } from "@/lib/workflow/types";
import {
  claimSourceFileIngestStep,
  createSourceIngestSandboxStep,
  dispatchSourceUploadAutomationsStep,
  extractSourceIngestEntriesStep,
  getStoredFileMetadataStep,
  markSourceFileIngestStateStep,
  parseHlEntriesStep,
  prepareSourceIngestSandboxStep,
  stopSourceIngestSandboxStep,
  upsertSourceFileTranslationKeysStep,
  writeSourceIngestFileStep,
} from "./steps/source-file-ingest";
import { getStoredFileContentStep } from "./steps/translation-job";

function sanitizeSandboxFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

function userFacingIngestFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "source file ingest failed";
  if (message.includes("hyperlocalise CLI installation failed")) {
    return "failed to prepare the translation parser environment";
  }
  if (message.includes("failed to extract entries")) {
    return "the file format could not be parsed into translation keys";
  }
  return message;
}

export async function sourceFileIngestWorkflow(event: SourceFileIngestEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimSourceFileIngestStep({
    sourceFileVersionId: event.sourceFileVersionId,
    organizationId: event.organizationId,
    workflowRunId,
  });

  if (!claim) {
    return { status: "skipped" as const, reason: "not_claimable" };
  }

  let sandboxId: string | null = null;

  try {
    const [storedFile, content] = await Promise.all([
      getStoredFileMetadataStep(event.storedFileId, event.organizationId),
      getStoredFileContentStep(event.storedFileId, event.organizationId),
    ]);

    const repositorySourceFileId = claim.repositorySourceFileId;
    if (!repositorySourceFileId) {
      throw new Error(`repository source file not found for ${event.sourcePath}`);
    }

    const inputFilename = sanitizeSandboxFilename(
      basename(event.sourcePath) || storedFile.filename,
    );
    ({ sandboxId } = await createSourceIngestSandboxStep());

    await prepareSourceIngestSandboxStep(sandboxId);
    await writeSourceIngestFileStep(sandboxId, inputFilename, content);

    const extractedEntries = await extractSourceIngestEntriesStep(sandboxId, inputFilename);
    const entries = await parseHlEntriesStep(extractedEntries);

    if (entries.length > 0) {
      await upsertSourceFileTranslationKeysStep({
        organizationId: event.organizationId,
        projectId: event.projectId,
        repositorySourceFileId,
        sourceFileVersionId: event.sourceFileVersionId,
        entries,
      });
    }

    await markSourceFileIngestStateStep({
      sourceFileVersionId: event.sourceFileVersionId,
      organizationId: event.organizationId,
      ingestState: "ingested",
      ingestWorkflowRunId: workflowRunId,
      ingestedAt: new Date(),
      fromIngestingWorkflowRunId: workflowRunId,
    });

    await dispatchSourceUploadAutomationsStep({
      organizationId: event.organizationId,
      projectId: event.projectId,
      sourceFileId: event.storedFileId,
      sourceFileVersionId: event.sourceFileVersionId,
      sourcePath: event.sourcePath,
    });

    return {
      status: "ingested" as const,
      importedKeyCount: entries.length,
    };
  } catch (error) {
    const reason = userFacingIngestFailureReason(error);

    await markSourceFileIngestStateStep({
      sourceFileVersionId: event.sourceFileVersionId,
      organizationId: event.organizationId,
      ingestState: "failed",
      ingestError: reason,
      ingestWorkflowRunId: workflowRunId,
      fromIngestingWorkflowRunId: workflowRunId,
    });

    throw error;
  } finally {
    if (sandboxId) {
      await stopSourceIngestSandboxStep(sandboxId).catch(() => undefined);
    }
  }
}
