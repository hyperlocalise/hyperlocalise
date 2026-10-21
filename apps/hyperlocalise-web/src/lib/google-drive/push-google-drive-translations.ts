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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { loadProjectOfficeTranslationDownload } from "@/lib/projects/files/office-translation-download";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import {
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedSourceUploadFormat,
} from "@/lib/translation/file-formats";

import { GOOGLE_EXPORT_MIME, GOOGLE_MIME } from "./constants";
import {
  createGoogleDriveFolder,
  findGoogleDriveChildByName,
  getGoogleDriveFile,
  uploadGoogleDriveFile,
} from "./drive-api";
import { loadGoogleDrivePipesAccessToken } from "./pipes";
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

async function ensureLocaleFolder(input: {
  accessToken: string;
  parentId: string;
  locale: string;
  driveId: string | null;
  cached: Record<string, string>;
}): Promise<string> {
  const cached = input.cached[input.locale];
  if (cached) {
    return cached;
  }

  const existing = await findGoogleDriveChildByName({
    accessToken: input.accessToken,
    parentId: input.parentId,
    name: input.locale,
    mimeType: GOOGLE_MIME.folder,
    driveId: input.driveId,
  });
  if (!isErr(existing) && existing.value) {
    input.cached[input.locale] = existing.value.id;
    return existing.value.id;
  }

  const created = await createGoogleDriveFolder({
    accessToken: input.accessToken,
    parentId: input.parentId,
    name: input.locale,
    driveId: input.driveId,
  });
  if (isErr(created)) {
    throw new Error(created.error.code);
  }
  input.cached[input.locale] = created.value.id;
  return created.value.id;
}

async function loadTranslatedBytes(input: {
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

  const prefilled = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    includeAllSourceKeys: true,
  });
  if (prefilled.loadedKeyCount === 0 || prefilled.truncated) {
    return null;
  }

  const fileName = input.sourcePath.split("/").pop() ?? "file";
  const format = inferSupportedSourceUploadFormat(fileName);
  if (!format) {
    return null;
  }

  const serialized = JSON.stringify(prefilled.prefilled, null, 2);
  return {
    buffer: Buffer.from(serialized, "utf8"),
    fileName,
    mimeType: format === "markdown" ? "text/markdown" : "application/octet-stream",
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
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) {
    throw new Error("project_not_found");
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
            ? await ensureLocaleFolder({
                accessToken: tokenResult.value,
                parentId,
                locale: formatDriveLocaleTag(locale),
                driveId: fileMeta.value.driveId,
                cached: localeFolderCache,
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
