import { db } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createLogger } from "@/lib/log";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  getLatestRepositorySourceFileVersion,
  normalizeSourcePath,
  sha256Hex,
} from "@/lib/file-storage/records";
import { sourceContentType, sourceFilename } from "@/lib/file-storage/source-file-metadata";
import { runSandboxCommand } from "@/lib/translation/sandbox";
import { inferSupportedSourceUploadFormat } from "@/lib/translation/file-formats";

const logger = createLogger("upload-repository-source-files");

export type UploadRepositorySourceFileResult =
  | {
      path: string;
      outcome: "uploaded";
      fileId: string;
      sourceFileVersionId: string;
    }
  | {
      path: string;
      outcome: "skipped";
      reason: string;
      sourceFileVersionId?: string;
    }
  | {
      path: string;
      outcome: "failed";
      reason: string;
    };

export async function uploadRepositorySourceFilesFromSandbox(input: {
  sandboxId: string;
  organizationId: string;
  projectId: string;
  paths: string[];
  commitSha?: string | null;
  workflowRunId?: string | null;
  uploadSurface?: string;
}): Promise<UploadRepositorySourceFileResult[]> {
  const adapter = getFileStorageAdapter();
  const results: UploadRepositorySourceFileResult[] = [];

  for (const path of input.paths) {
    const normalizedPath = normalizeSourcePath(path);
    if (!inferSupportedSourceUploadFormat(normalizedPath)) {
      results.push({
        path: normalizedPath,
        outcome: "skipped",
        reason: "unsupported_source_file_format",
      });
      continue;
    }

    const readResult = await runSandboxCommand(input.sandboxId, "cat", [normalizedPath], {
      output: "stdout",
    });
    if (readResult.exitCode !== 0) {
      results.push({
        path: normalizedPath,
        outcome: "failed",
        reason: "failed_to_read_source_file",
      });
      continue;
    }

    const content = Buffer.from(readResult.output);
    const sourceHash = await sha256Hex(content);

    if (input.commitSha) {
      const latestVersion = await getLatestRepositorySourceFileVersion({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: normalizedPath,
      });

      if (
        latestVersion &&
        latestVersion.commitSha === input.commitSha &&
        latestVersion.sourceHash === sourceHash
      ) {
        results.push({
          path: normalizedPath,
          outcome: "skipped",
          reason: "unchanged_for_commit",
          sourceFileVersionId: latestVersion.id,
        });
        continue;
      }
    }

    let uploadedStorageKey: string | null = null;

    try {
      const { storedFile, version } = await db.transaction(async (tx) => {
        const storedFile = await createStoredFile({
          organizationId: input.organizationId,
          projectId: input.projectId,
          createdByUserId: null,
          role: "source",
          sourceKind: "repository_file",
          filename: sourceFilename(normalizedPath),
          contentType: sourceContentType(normalizedPath),
          content,
          metadata: {
            sourcePath: normalizedPath,
            commitSha: input.commitSha ?? null,
            workflowRunId: input.workflowRunId ?? null,
            uploadSurface: input.uploadSurface ?? "github_automation",
          },
          adapter,
          db: tx,
        });
        uploadedStorageKey = storedFile.storageKey;

        const version = await createRepositorySourceFileVersion({
          storedFile,
          sourcePath: normalizedPath,
          sourceHash,
          commitSha: input.commitSha ?? null,
          workflowRunId: input.workflowRunId ?? null,
          uploadSurface: input.uploadSurface ?? "github_automation",
          db: tx,
        });

        return { storedFile, version };
      });

      results.push({
        path: normalizedPath,
        outcome: "uploaded",
        fileId: storedFile.id,
        sourceFileVersionId: version.id,
      });

      void enqueueSourceFileIngestAfterUpload({
        organizationId: input.organizationId,
        projectId: input.projectId,
        storedFileId: storedFile.id,
        sourceFileVersionId: version.id,
        sourcePath: normalizedPath,
        sourceHash,
      }).catch((error) => {
        logger.warn(
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sourceFileVersionId: version.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "repository source file ingest enqueue failed",
        );
      });
    } catch (error) {
      if (uploadedStorageKey) {
        await adapter.delete({ keyOrUrl: uploadedStorageKey }).catch(() => undefined);
      }

      logger.error(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          reason: "failed_to_store_source_file",
          err: error,
        },
        "failed to store repository source file",
      );

      results.push({
        path: normalizedPath,
        outcome: "failed",
        reason: "failed_to_store_source_file",
      });
    }
  }

  return results;
}
