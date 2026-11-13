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
import { enqueueFileUploadedActivity } from "@/lib/activity-log/file-segment-events";
import { db } from "@/lib/database/client";
import { getFileStorageAdapter } from "./get-file-storage-adapter";
import type { FileStorageAdapter } from "./types";
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
import { readTranslatedFile } from "@/lib/translation/sandbox";
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
      storedFileId?: string;
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
  rewriteSourcePath?: (sandboxPath: string) => string | null;
}): Promise<UploadRepositorySourceFileResult[]> {
  const adapter = getFileStorageAdapter();
  const results: UploadRepositorySourceFileResult[] = [];

  for (const path of input.paths) {
    const sandboxPath = normalizeSourcePath(path);
    const rewrittenPath = input.rewriteSourcePath
      ? input.rewriteSourcePath(sandboxPath)
      : sandboxPath;
    if (!rewrittenPath) {
      results.push({
        path: sandboxPath,
        outcome: "skipped",
        reason: "outside_provider_folder",
      });
      continue;
    }
    const normalizedPath = normalizeSourcePath(rewrittenPath);
    if (!inferSupportedSourceUploadFormat(sandboxPath)) {
      results.push({
        path: normalizedPath,
        outcome: "skipped",
        reason: "unsupported_source_file_format",
      });
      continue;
    }

    let content: Buffer;
    try {
      // Binary read avoids sandbox stdout UTF-8 corruption (multi-byte → �).
      content = await readTranslatedFile(input.sandboxId, sandboxPath);
    } catch {
      results.push({
        path: normalizedPath,
        outcome: "failed",
        reason: "failed_to_read_source_file",
      });
      continue;
    }

    results.push(
      await storeRepositorySourceFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: normalizedPath,
        content,
        commitSha: input.commitSha ?? null,
        workflowRunId: input.workflowRunId ?? null,
        uploadSurface: input.uploadSurface ?? "github_automation",
        adapter,
      }),
    );
  }

  return results;
}

/** An ingest still running this long after its upload is taken as dead. */
const STALE_INGEST_MS = 60 * 60 * 1000;

/**
 * Stores one repository file as a new source file version and queues its ingest, unless
 * `skipUnchanged` says the latest version already is this file. The caller has already read
 * the bytes, so this is the part every repository importer shares.
 */
export async function storeRepositorySourceFile(input: {
  organizationId: string;
  projectId: string;
  /** The project path, already normalized. */
  sourcePath: string;
  content: Buffer;
  commitSha: string | null;
  workflowRunId: string | null;
  uploadSurface: string;
  /**
   * `commit` (the default) stores a file again at every new commit; `content` skips it while
   * its bytes are unchanged, whatever the commit, as long as the latest version is the caller's
   * own and its ingest isn't still running from a recent upload (an ingest still running an
   * hour on would otherwise block the file for good).
   */
  skipUnchanged?: "commit" | "content";
  adapter?: FileStorageAdapter;
}): Promise<UploadRepositorySourceFileResult> {
  const adapter = input.adapter ?? getFileStorageAdapter();
  const normalizedPath = input.sourcePath;
  const content = input.content;
  const sourceHash = await sha256Hex(content);

  if (input.commitSha) {
    const latestVersion = await getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: normalizedPath,
    });

    const unchanged =
      latestVersion !== null &&
      latestVersion.sourceHash === sourceHash &&
      (input.skipUnchanged === "content"
        ? latestVersion.uploadSurface === input.uploadSurface &&
          (latestVersion.ingestState !== "ingesting" ||
            Date.now() - latestVersion.createdAt.getTime() < STALE_INGEST_MS)
        : latestVersion.commitSha === input.commitSha);
    if (latestVersion && unchanged) {
      return {
        path: normalizedPath,
        outcome: "skipped",
        reason: input.skipUnchanged === "content" ? "unchanged" : "unchanged_for_commit",
        sourceFileVersionId: latestVersion.id,
        storedFileId: latestVersion.storedFileId,
      };
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
          commitSha: input.commitSha,
          workflowRunId: input.workflowRunId,
          uploadSurface: input.uploadSurface,
        },
        adapter,
        db: tx,
      });
      uploadedStorageKey = storedFile.storageKey;

      const version = await createRepositorySourceFileVersion({
        storedFile,
        sourcePath: normalizedPath,
        sourceHash,
        commitSha: input.commitSha,
        workflowRunId: input.workflowRunId,
        uploadSurface: input.uploadSurface,
        db: tx,
      });

      return { storedFile, version };
    });

    await enqueueFileUploadedActivity({
      actorCredentialId: null,
      actorKind: "agent",
      actorUserId: null,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: normalizedPath,
      storedFileId: storedFile.id,
      versionId: version.id,
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

    return {
      path: normalizedPath,
      outcome: "uploaded",
      fileId: storedFile.id,
      sourceFileVersionId: version.id,
    };
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

    return {
      path: normalizedPath,
      outcome: "failed",
      reason: "failed_to_store_source_file",
    };
  }
}
