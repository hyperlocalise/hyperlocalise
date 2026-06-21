import { getWorkflowMetadata } from "workflow";
import path from "node:path";

import type { SourceFileIngestEventData } from "@/lib/workflow/types";
import { entriesFromHlOutput } from "@/lib/projects/files/source-file-ingest";
import {
  claimSourceFileIngestStep,
  dispatchSourceUploadAutomationsStep,
  getStoredFileMetadataStep,
  markSourceFileIngestStateStep,
  upsertSourceFileTranslationKeysStep,
} from "./steps/source-file-ingest";
import { getStoredFileContentStep } from "./steps/translation-job";

function sanitizeSandboxFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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

async function createSandboxStep() {
  "use step";
  const { createTranslationSandbox } = await import("@/lib/translation/sandbox-translation");
  return createTranslationSandbox();
}

async function prepareSandboxStep(sandboxId: string) {
  "use step";
  const { prepareSandbox } = await import("@/lib/translation/sandbox-translation");
  return prepareSandbox(sandboxId);
}

async function writeSourceFileStep(sandboxId: string, filename: string, content: Buffer) {
  "use step";
  const { writeFileToSandbox } = await import("@/lib/translation/sandbox-translation");
  return writeFileToSandbox(sandboxId, filename, content);
}

async function extractEntriesStep(sandboxId: string, path: string) {
  "use step";
  const { extractSandboxEntries } = await import("@/lib/translation/sandbox-translation");
  const entries = await extractSandboxEntries(sandboxId, path);
  if (!entries) {
    throw new Error(`failed to extract entries for ${path}`);
  }
  return entries;
}

async function stopSandboxStep(sandboxId: string) {
  "use step";
  const { stopTranslationSandbox } = await import("@/lib/translation/sandbox-translation");
  return stopTranslationSandbox(sandboxId);
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
      path.basename(event.sourcePath) || storedFile.filename,
    );
    ({ sandboxId } = await createSandboxStep());

    await prepareSandboxStep(sandboxId);
    await writeSourceFileStep(sandboxId, inputFilename, content);

    const extractedEntries = await extractEntriesStep(sandboxId, inputFilename);
    const entries = entriesFromHlOutput(extractedEntries);

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
    }).catch(() => undefined);

    throw error;
  } finally {
    if (sandboxId) {
      await stopSandboxStep(sandboxId).catch(() => undefined);
    }
  }
}
