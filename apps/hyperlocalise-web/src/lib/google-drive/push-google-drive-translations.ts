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

import { and, eq } from "drizzle-orm";

import {
  isContentSyncJsonCompatiblePath,
  serializeContentSyncJsonExport,
} from "@/lib/agents/content-sync/content-sync-export";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { getImageVariant } from "@/lib/projects/files/image-variant-service";
import { loadProjectFileVariant } from "@/lib/projects/files/file-variant-download";
import { loadProjectLottieTranslationDownload } from "@/lib/projects/files/lottie-translation-download";
import { loadProjectOfficeTranslationDownload } from "@/lib/projects/files/office-translation-download";
import { loadProjectSubtitleTranslationDownload } from "@/lib/projects/files/subtitle-translation-download";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import {
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";

import { GOOGLE_EXPORT_MIME, GOOGLE_MIME } from "./constants";
import {
  createGoogleDriveFolder,
  findGoogleDriveChildByName,
  getGoogleDriveFile,
  uploadGoogleDriveFile,
} from "./drive-api";
import { loadGoogleDrivePipesAccessToken } from "./pipes";
import { relativePathFromGoogleDriveSourcePath } from "./source-path";
import {
  buildTranslatedDriveName,
  formatDriveLocaleTag,
  resolveGoogleDriveTranslationOutput,
  stripExtension,
} from "./translation-filename";

const logger = createLogger("push-google-drive-translations");

export type PushGoogleDriveTranslationsResult = {
  pushed: number;
  skipped: number;
  failed: number;
};

export function resolveGoogleDrivePushTargetLocales(
  automation: WorkspaceAutomationRecord,
  projectTargets: string[],
): string[] {
  const configured = automation.toolConfig.googleDrive?.targetLocales ?? [];
  if (configured.length === 0) {
    return projectTargets;
  }
  const allowed = new Set(projectTargets.map((locale) => locale.toLowerCase()));
  return configured.filter((locale) => allowed.has(locale.toLowerCase()));
}

export function readGoogleDrivePushSourcePaths(
  inputSnapshot: Record<string, unknown> | null | undefined,
): string[] | undefined {
  const raw = inputSnapshot?.sourcePaths;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export function selectGoogleDrivePushMappings<T extends { sourcePath: string }>(
  mappings: T[],
  sourcePaths?: readonly string[],
): T[] {
  if (!sourcePaths) {
    return mappings;
  }
  const selected = new Set(sourcePaths.filter((path) => path.trim().length > 0));
  return mappings.filter((mapping) => selected.has(mapping.sourcePath));
}

function namedFolderCacheKey(input: {
  parentId: string;
  name: string;
  driveId: string | null;
}): string {
  return `${input.parentId}\0${input.name}\0${input.driveId ?? ""}`;
}

async function resolveNamedFolder(input: {
  accessToken: string;
  parentId: string;
  name: string;
  driveId: string | null;
}): Promise<string> {
  const existing = await findGoogleDriveChildByName({
    accessToken: input.accessToken,
    parentId: input.parentId,
    name: input.name,
    mimeType: GOOGLE_MIME.folder,
    driveId: input.driveId,
  });
  if (!isErr(existing) && existing.value) {
    return existing.value.id;
  }

  const created = await createGoogleDriveFolder({
    accessToken: input.accessToken,
    parentId: input.parentId,
    name: input.name,
    driveId: input.driveId,
  });
  if (isErr(created)) {
    throw new Error(created.error.code);
  }
  return created.value.id;
}

async function ensureNamedFolder(input: {
  accessToken: string;
  parentId: string;
  name: string;
  driveId: string | null;
  folderPromises?: Map<string, Promise<string>>;
}): Promise<string> {
  const cache = input.folderPromises;
  if (!cache) {
    return resolveNamedFolder(input);
  }
  const key = namedFolderCacheKey(input);
  const pending = cache.get(key);
  if (pending) {
    return pending;
  }
  const promise = resolveNamedFolder(input);
  cache.set(key, promise);
  return promise;
}

async function ensureLocaleFolder(input: {
  accessToken: string;
  parentId: string;
  locale: string;
  driveId: string | null;
  cached: Record<string, string>;
  folderPromises?: Map<string, Promise<string>>;
}): Promise<string> {
  const cached = input.cached[input.locale];
  if (cached) {
    const cachedMeta = await getGoogleDriveFile({
      accessToken: input.accessToken,
      fileId: cached,
    });
    if (!isErr(cachedMeta) && cachedMeta.value.parents.includes(input.parentId)) {
      return cached;
    }
    delete input.cached[input.locale];
  }

  const folderId = await ensureNamedFolder({
    accessToken: input.accessToken,
    parentId: input.parentId,
    name: input.locale,
    driveId: input.driveId,
    folderPromises: input.folderPromises,
  });
  input.cached[input.locale] = folderId;
  return folderId;
}

async function ensureFolderPath(input: {
  accessToken: string;
  parentId: string;
  segments: string[];
  driveId: string | null;
  folderPromises?: Map<string, Promise<string>>;
}): Promise<string> {
  let parentId = input.parentId;
  for (const segment of input.segments) {
    parentId = await ensureNamedFolder({
      accessToken: input.accessToken,
      parentId,
      name: segment,
      driveId: input.driveId,
      folderPromises: input.folderPromises,
    });
  }
  return parentId;
}

export async function loadTranslatedBytes(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  ingestFormat: string;
}): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const officeFormat = inferSupportedOfficeTranslationFileFormat(input.sourcePath);
  if (officeFormat) {
    const office = await loadProjectOfficeTranslationDownload({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      approvedTranslationsOnly: true,
    });
    if (isErr(office) || !office.value) {
      return null;
    }
    const ext = `.${officeFormat}`;
    const baseName = input.sourcePath.split("/").pop() ?? "file";
    const { base } = stripExtension(baseName);
    const uploadMime =
      officeFormat === "docx"
        ? GOOGLE_EXPORT_MIME.docx
        : officeFormat === "pptx"
          ? GOOGLE_EXPORT_MIME.pptx
          : GOOGLE_EXPORT_MIME.xlsx;
    return {
      buffer: office.value.content,
      fileName: `${base}${ext}`,
      mimeType: uploadMime,
    };
  }

  const isPlainTextSource =
    inferSupportedTranslationFileFormat(input.sourcePath) === "txt" || input.ingestFormat === "txt";
  if (isPlainTextSource) {
    const variant = await getImageVariant({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
    });
    if (variant?.status !== "approved") {
      return null;
    }
    const fileVariant = await loadProjectFileVariant({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      locale: input.targetLocale,
    });
    if (!fileVariant) {
      return null;
    }
    const fileName = input.sourcePath.split("/").pop() ?? "file";
    const buffer = Buffer.from(await new Response(fileVariant.body).arrayBuffer());
    return {
      buffer,
      fileName,
      mimeType: "text/plain; charset=utf-8",
    };
  }

  const prefilled = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    includeAllSourceKeys: true,
    readyTranslationsOnly: true,
    approvedTranslationsOnly: true,
  });
  if (prefilled.loadedKeyCount === 0 || prefilled.truncated) {
    return null;
  }

  const fileName = input.sourcePath.split("/").pop() ?? "file";
  const lottie = await loadProjectLottieTranslationDownload({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    prefilled: prefilled.prefilled,
  });
  if (isErr(lottie)) {
    return null;
  }
  if (lottie.value) {
    return {
      buffer: lottie.value.content,
      fileName,
      mimeType: lottie.value.contentType,
    };
  }

  const subtitle = await loadProjectSubtitleTranslationDownload({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    prefilled: prefilled.prefilled,
  });
  if (isErr(subtitle)) {
    return null;
  }
  if (subtitle.value) {
    return {
      buffer: subtitle.value.content,
      fileName,
      mimeType: subtitle.value.contentType,
    };
  }

  if (!isContentSyncJsonCompatiblePath(input.sourcePath)) {
    return null;
  }

  return {
    buffer: serializeContentSyncJsonExport(prefilled.prefilled),
    fileName,
    mimeType: "application/json",
  };
}

function nativeUploadMime(sourceMimeType: string, fileMimeType: string): string {
  if (sourceMimeType === GOOGLE_MIME.document) {
    return GOOGLE_MIME.document;
  }
  if (sourceMimeType === GOOGLE_MIME.spreadsheet) {
    return GOOGLE_MIME.spreadsheet;
  }
  if (sourceMimeType === GOOGLE_MIME.presentation) {
    return GOOGLE_MIME.presentation;
  }
  return fileMimeType;
}

export async function runPushGoogleDriveTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushGoogleDriveTranslationsResult> {
  const config = input.automation.toolConfig.googleDrive;
  if (!config?.enabled || !config.workosUserId) {
    throw new Error("google_drive_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("project_not_found");
  }
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project || project.source !== "native") {
    throw new Error("google_drive_native_project_required");
  }

  const tokenResult = await loadGoogleDrivePipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: config.workosUserId,
  });
  if (isErr(tokenResult)) {
    throw new Error(tokenResult.error.code);
  }

  const translationOutput = resolveGoogleDriveTranslationOutput(config.translationOutput);
  const targetLocales = resolveGoogleDrivePushTargetLocales(
    input.automation,
    (project.targetLocales as string[]) ?? [],
  );
  if (targetLocales.length === 0) {
    throw new Error("google_drive_target_locales_required");
  }

  const mappings = selectGoogleDrivePushMappings(
    await db
      .select()
      .from(schema.googleDriveFileSyncStates)
      .where(
        and(
          eq(schema.googleDriveFileSyncStates.automationId, input.automation.id),
          eq(schema.googleDriveFileSyncStates.status, "active"),
        ),
      ),
    input.sourcePaths,
  );

  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  const folderPromises = new Map<string, Promise<string>>();

  await mapWithConcurrency(mappings, 4, async (mapping) => {
    try {
      const fileMeta = await getGoogleDriveFile({
        accessToken: tokenResult.value,
        fileId: mapping.driveFileId,
      });
      if (isErr(fileMeta)) {
        failed += 1;
        return;
      }
      const parentId = fileMeta.value.parents[0];
      if (!parentId) {
        failed += 1;
        return;
      }

      const localeFolderCache = { ...mapping.localeFolderIds };
      const translatedFileIds = { ...mapping.translatedFileIds };
      const lastPushContentHash = { ...mapping.lastPushContentHash };

      for (const locale of targetLocales) {
        const translated = await loadTranslatedBytes({
          organizationId: input.organizationId,
          projectId: project.id,
          sourcePath: mapping.sourcePath,
          targetLocale: locale,
          ingestFormat: mapping.ingestFormat,
        });
        if (!translated) {
          skipped += 1;
          continue;
        }

        const pushHash = createHash("sha256").update(translated.buffer).digest("hex");
        if (lastPushContentHash[locale] === pushHash) {
          skipped += 1;
          continue;
        }

        const driveName = buildTranslatedDriveName({
          output: translationOutput,
          locale,
          fileName: translated.fileName,
        });
        const localeFolderId =
          translationOutput === "folder"
            ? await ensureFolderPath({
                accessToken: tokenResult.value,
                parentId: await ensureLocaleFolder({
                  accessToken: tokenResult.value,
                  parentId: mapping.folderId,
                  locale: formatDriveLocaleTag(locale),
                  driveId: fileMeta.value.driveId,
                  cached: localeFolderCache,
                  folderPromises,
                }),
                segments: relativePathFromGoogleDriveSourcePath(
                  mapping.sourcePath,
                  mapping.folderId,
                )
                  .split("/")
                  .filter(Boolean),
                driveId: fileMeta.value.driveId,
                folderPromises,
              })
            : parentId;
        const officeFormat = inferSupportedOfficeTranslationFileFormat(mapping.sourcePath);
        const uploadMime =
          officeFormat && mapping.mimeType.startsWith("application/vnd.google-apps.")
            ? nativeUploadMime(mapping.mimeType, translated.mimeType)
            : translated.mimeType;

        const uploaded = await uploadGoogleDriveFile({
          accessToken: tokenResult.value,
          parentId: localeFolderId,
          name: driveName,
          mimeType: uploadMime,
          content: translated.buffer,
          existingFileId: translatedFileIds[locale] ?? null,
        });
        if (isErr(uploaded)) {
          failed += 1;
          continue;
        }

        translatedFileIds[locale] = uploaded.value.id;
        lastPushContentHash[locale] = pushHash;
        pushed += 1;
      }

      await db
        .update(schema.googleDriveFileSyncStates)
        .set({
          translatedFileIds,
          localeFolderIds: localeFolderCache,
          lastPushContentHash,
          lastPushedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.googleDriveFileSyncStates.id, mapping.id));
    } catch (error) {
      failed += 1;
      logger.warn("google_drive_push_failed", {
        driveFileId: mapping.driveFileId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return { pushed, skipped, failed };
}
