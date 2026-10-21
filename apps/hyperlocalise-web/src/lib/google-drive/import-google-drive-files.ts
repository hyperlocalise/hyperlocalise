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

import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";

import {
  GOOGLE_DRIVE_FILE_IMPORT_CONCURRENCY,
  GOOGLE_DRIVE_UPLOAD_SURFACE,
  GOOGLE_MIME,
} from "./constants";
import {
  downloadGoogleDriveMedia,
  exportGoogleDriveFile,
  getGoogleDriveFile,
  listGoogleDriveChildren,
} from "./drive-api";
import {
  classifyGoogleDriveItem,
  hideGoogleDriveTranslationOutputsOnIngest,
} from "./file-classification";
import { GOOGLE_DRIVE_MAX_FOLDER_DEPTH } from "./limits";
import { pdfBufferToMarkdown } from "./pdf-to-markdown";
import { loadGoogleDrivePipesAccessToken } from "./pipes";
import { buildGoogleDriveSourcePath } from "./source-path";
import {
  isLocaleFolderName,
  resolveGoogleDriveTranslationOutput,
  stripExtension,
  type GoogleDriveTranslationOutput,
} from "./translation-filename";

const logger = createLogger("import-google-drive-files");

export type ImportGoogleDriveFilesResult = {
  imported: number;
  skipped: number;
  failed: number;
};

type WalkFile = {
  fileId: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  md5Checksum: string | null;
  relativePath: string;
  rootFolderId: string;
  driveId: string | null;
};

function readGoogleDriveConfig(automation: WorkspaceAutomationRecord) {
  const googleDrive = automation.toolConfig.googleDrive;
  if (!googleDrive?.enabled || !googleDrive.workosUserId) {
    throw new Error("google_drive_not_configured");
  }
  if (!googleDrive.folderIds?.length && !googleDrive.fileIds?.length) {
    throw new Error("google_drive_folders_required");
  }
  return googleDrive;
}

async function walkGoogleDriveFolder(input: {
  accessToken: string;
  rootFolderId: string;
  driveId: string | null;
  folderId: string;
  relativePath: string;
  depth: number;
  includeTranslatedFiles: boolean;
  translationOutput: GoogleDriveTranslationOutput;
  fileIdAllowList: Set<string> | null;
  collected: WalkFile[];
}): Promise<void> {
  if (input.depth > GOOGLE_DRIVE_MAX_FOLDER_DEPTH) {
    return;
  }

  let pageToken: string | undefined;
  do {
    const listResult = await listGoogleDriveChildren({
      accessToken: input.accessToken,
      folderId: input.folderId,
      driveId: input.driveId,
      pageToken,
    });
    if (isErr(listResult)) {
      throw new Error(listResult.error.code);
    }

    for (const child of listResult.value.files) {
      const classification = classifyGoogleDriveItem({
        name: child.name,
        mimeType: child.mimeType,
        sizeBytes: child.size,
        folderDepth: input.depth,
        hideTranslationOutputs: !input.includeTranslatedFiles,
        relativePath: input.relativePath,
        translationOutput: input.translationOutput,
      });

      if (classification.kind === "folder") {
        if (
          !input.includeTranslatedFiles &&
          input.translationOutput === "folder" &&
          isLocaleFolderName(child.name)
        ) {
          continue;
        }
        await walkGoogleDriveFolder({
          ...input,
          folderId: child.id,
          relativePath: input.relativePath ? `${input.relativePath}/${child.name}` : child.name,
          depth: input.depth + 1,
        });
        continue;
      }

      if (classification.kind === "skipped") {
        continue;
      }

      if (input.fileIdAllowList && !input.fileIdAllowList.has(child.id)) {
        continue;
      }

      input.collected.push({
        fileId: child.id,
        name: child.name,
        mimeType: child.mimeType,
        size: child.size,
        modifiedTime: child.modifiedTime,
        md5Checksum: child.md5Checksum,
        relativePath: input.relativePath,
        rootFolderId: input.rootFolderId,
        driveId: input.driveId,
      });
    }

    pageToken = listResult.value.nextPageToken ?? undefined;
  } while (pageToken);
}

async function loadIngestBuffer(input: {
  accessToken: string;
  file: WalkFile;
  hideTranslationOutputs: boolean;
  translationOutput: GoogleDriveTranslationOutput;
}): Promise<{ buffer: Buffer; fileName: string; contentType: string; format: string } | null> {
  const metaResult = await getGoogleDriveFile({
    accessToken: input.accessToken,
    fileId: input.file.fileId,
  });
  if (isErr(metaResult)) {
    return null;
  }

  const classification = classifyGoogleDriveItem({
    name: input.file.name,
    mimeType: input.file.mimeType,
    sizeBytes: input.file.size,
    hideTranslationOutputs: input.hideTranslationOutputs,
    relativePath: input.file.relativePath,
    translationOutput: input.translationOutput,
  });
  if (classification.kind !== "supported") {
    return null;
  }

  if (classification.ingestKind === "pdf_as_markdown") {
    const download = await downloadGoogleDriveMedia({
      accessToken: input.accessToken,
      fileId: input.file.fileId,
    });
    if (isErr(download)) {
      return null;
    }
    const markdown = await pdfBufferToMarkdown(download.value);
    const { base } = stripExtension(input.file.name);
    return {
      buffer: Buffer.from(markdown, "utf8"),
      fileName: `${base}.md`,
      contentType: "text/markdown",
      format: classification.ingestFormat,
    };
  }

  if (classification.exportMimeType) {
    const exported = await exportGoogleDriveFile({
      accessToken: input.accessToken,
      fileId: input.file.fileId,
      exportMimeType: classification.exportMimeType,
      exportLinks: metaResult.value.exportLinks,
    });
    if (isErr(exported)) {
      return null;
    }
    const { base } = stripExtension(input.file.name);
    const fileName = `${base}${classification.ingestExtension}`;
    return {
      buffer: exported.value,
      fileName,
      contentType: classification.exportMimeType,
      format: classification.ingestFormat,
    };
  }

  const download = await downloadGoogleDriveMedia({
    accessToken: input.accessToken,
    fileId: input.file.fileId,
  });
  if (isErr(download)) {
    return null;
  }
  return {
    buffer: download.value,
    fileName: input.file.name,
    contentType: input.file.mimeType,
    format: classification.ingestFormat,
  };
}

export async function runImportGoogleDriveFiles(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string;
}): Promise<ImportGoogleDriveFilesResult> {
  const config = readGoogleDriveConfig(input.automation);
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("project_not_found");
  }
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) {
    throw new Error("project_not_found");
  }

  const tokenResult = await loadGoogleDrivePipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: config.workosUserId!,
  });
  if (isErr(tokenResult)) {
    throw new Error(tokenResult.error.code);
  }
  const accessToken = tokenResult.value;

  const folders =
    config.folderIds.length > 0
      ? await db
          .select()
          .from(schema.googleDriveFolders)
          .where(
            and(
              eq(schema.googleDriveFolders.organizationId, input.organizationId),
              inArray(schema.googleDriveFolders.id, config.folderIds),
            ),
          )
      : [];

  const toImport: WalkFile[] = [];
  const translationOutput = resolveGoogleDriveTranslationOutput(config.translationOutput);
  const includeTranslatedFiles = config.includeTranslatedFiles ?? false;
  const explicitFileIds = new Set(config.fileIds ?? []);

  async function collectDriveItem(inputItem: {
    fileId: string;
    driveId: string | null;
    relativePath: string;
    rootFolderId: string;
  }) {
    if (toImport.some((file) => file.fileId === inputItem.fileId)) {
      return;
    }
    const metaResult = await getGoogleDriveFile({
      accessToken,
      fileId: inputItem.fileId === "root" ? "root" : inputItem.fileId,
    });
    if (isErr(metaResult)) {
      throw new Error(metaResult.error.code);
    }

    if (metaResult.value.mimeType === GOOGLE_MIME.folder) {
      await walkGoogleDriveFolder({
        accessToken,
        rootFolderId: inputItem.rootFolderId,
        driveId: inputItem.driveId ?? metaResult.value.driveId,
        folderId: inputItem.fileId,
        relativePath: inputItem.relativePath,
        depth: 0,
        includeTranslatedFiles,
        translationOutput,
        fileIdAllowList: null,
        collected: toImport,
      });
      return;
    }

    toImport.push({
      fileId: metaResult.value.id,
      name: metaResult.value.name,
      mimeType: metaResult.value.mimeType,
      size: metaResult.value.size,
      modifiedTime: metaResult.value.modifiedTime,
      md5Checksum: metaResult.value.md5Checksum,
      relativePath: inputItem.relativePath,
      rootFolderId: metaResult.value.parents[0] ?? inputItem.rootFolderId,
      driveId: inputItem.driveId ?? metaResult.value.driveId,
    });
  }

  for (const folder of folders) {
    await collectDriveItem({
      fileId: folder.folderId,
      driveId: folder.driveId,
      relativePath: "",
      rootFolderId: folder.folderId,
    });
  }

  for (const fileId of config.fileIds ?? []) {
    await collectDriveItem({
      fileId,
      driveId: null,
      relativePath: "",
      rootFolderId: fileId,
    });
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  await mapWithConcurrency(toImport, GOOGLE_DRIVE_FILE_IMPORT_CONCURRENCY, async (file) => {
    try {
      const ingestPayload = await loadIngestBuffer({
        accessToken,
        file,
        hideTranslationOutputs: hideGoogleDriveTranslationOutputsOnIngest({
          explicitlySelected: explicitFileIds.has(file.fileId),
          includeTranslatedFiles,
        }),
        translationOutput,
      });
      if (!ingestPayload) {
        failed += 1;
        return;
      }

      const sourcePath = buildGoogleDriveSourcePath({
        rootFolderId: file.rootFolderId,
        relativePath: file.relativePath,
        fileName: ingestPayload.fileName,
      });

      const [existing] = await db
        .select()
        .from(schema.googleDriveFileSyncStates)
        .where(
          and(
            eq(schema.googleDriveFileSyncStates.automationId, input.automation.id),
            eq(schema.googleDriveFileSyncStates.driveFileId, file.fileId),
          ),
        )
        .limit(1);

      const contentHash = createHash("sha256").update(ingestPayload.buffer).digest("hex");
      if (existing?.sourceContentHash === contentHash) {
        skipped += 1;
        return;
      }

      const uploadResult = await uploadSourceFile({
        organizationId: input.organizationId,
        project,
        file: {
          filename: ingestPayload.fileName,
          contentType: ingestPayload.contentType,
          content: ingestPayload.buffer,
        },
        sourcePath,
        sourceHash: contentHash,
        workflowRunId: input.workflowRunId ?? null,
        uploadSurface: GOOGLE_DRIVE_UPLOAD_SURFACE,
        format: ingestPayload.format,
      });
      if (isErr(uploadResult) || uploadResult.value.destination !== "native") {
        failed += 1;
        return;
      }

      await waitForSourceFileVersionIngest({
        organizationId: input.organizationId,
        sourceFileVersionId: uploadResult.value.file.sourceFileVersionId,
      });

      await db
        .insert(schema.googleDriveFileSyncStates)
        .values({
          organizationId: input.organizationId,
          automationId: input.automation.id,
          projectId: project.id,
          folderId: file.rootFolderId,
          driveFileId: file.fileId,
          mimeType: file.mimeType,
          ingestFormat: ingestPayload.format,
          sourcePath,
          md5Checksum: file.md5Checksum,
          modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
          sourceContentHash: contentHash,
          status: "active",
          lastImportedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.googleDriveFileSyncStates.automationId,
            schema.googleDriveFileSyncStates.driveFileId,
          ],
          set: {
            sourcePath,
            sourceContentHash: contentHash,
            md5Checksum: file.md5Checksum,
            modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
            status: "active",
            lastImportedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      imported += 1;
    } catch (error) {
      failed += 1;
      logger.warn("google_drive_import_file_failed", {
        driveFileId: file.fileId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return { imported, skipped, failed };
}
