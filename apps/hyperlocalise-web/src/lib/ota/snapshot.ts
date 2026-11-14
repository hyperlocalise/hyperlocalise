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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { OtaDistributionFormat, OtaManifestSnapshot } from "@/lib/database/schema/ota";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";

import { exportPathFromSourcePath } from "./export-path";
import { serializeOtaFile, toOtaPublicFormat } from "./formats";

export type OtaSnapshotFile = {
  relativePath: string;
  body: Buffer;
};

export type OtaReleaseSnapshot = {
  manifest: OtaManifestSnapshot;
  files: OtaSnapshotFile[];
};

type SnapshotFile = {
  id: string;
  sourcePath: string;
  exportPath: string;
};

function unixTimestampSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

function projectLocaleSet(project: {
  sourceLocale: string | null;
  targetLocales: string[];
}): Set<string> {
  const locales = new Set<string>();
  if (project.sourceLocale) {
    locales.add(canonicalizeLocale(project.sourceLocale) ?? project.sourceLocale);
  }
  for (const locale of project.targetLocales) {
    locales.add(canonicalizeLocale(locale) ?? locale);
  }
  return locales;
}

async function loadSnapshotFiles(
  projectId: string,
  fileIds: readonly string[],
  client: DatabaseClient,
): Promise<SnapshotFile[]> {
  if (fileIds.length === 0) {
    return [];
  }

  const rows = await client
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, projectId),
        eq(schema.repositorySourceFiles.branchName, DEFAULT_PROJECT_BRANCH_NAME),
        inArray(schema.repositorySourceFiles.id, [...fileIds]),
      ),
    );

  const pathById = new Map(rows.map((row) => [row.id, row.sourcePath]));
  return fileIds.flatMap((fileId) => {
    const sourcePath = pathById.get(fileId);
    if (!sourcePath) {
      return [];
    }
    return [{ id: fileId, sourcePath, exportPath: exportPathFromSourcePath(sourcePath) }];
  });
}

export function buildOtaManifestSnapshot(input: {
  files: readonly SnapshotFile[];
  locales: readonly string[];
  format: OtaDistributionFormat;
  timestamp?: number;
}): OtaManifestSnapshot {
  const files = input.files.map((file) => file.exportPath);
  const languages = [...input.locales];
  const content = Object.fromEntries(
    languages.map((locale) => [locale, files.map((file) => `/content/${locale}${file}`)]),
  );

  return {
    schema_version: 1,
    format: toOtaPublicFormat(input.format),
    files,
    languages,
    language_mapping: {},
    timestamp: input.timestamp ?? unixTimestampSeconds(),
    content,
  };
}

export async function buildOtaReleaseSnapshot(input: {
  organizationId: string;
  projectId: string;
  fileIds: readonly string[];
  locales: readonly string[];
  format: OtaDistributionFormat;
  sourceLocale: string | null;
  db?: DatabaseClient;
}): Promise<OtaReleaseSnapshot> {
  const client = input.db ?? db;
  const files = await loadSnapshotFiles(input.projectId, input.fileIds, client);
  const manifest = buildOtaManifestSnapshot({
    files,
    locales: input.locales,
    format: input.format,
  });

  const fileIds = files.map((file) => file.id);
  const keys =
    fileIds.length === 0
      ? []
      : await client
          .select({
            id: schema.projectTranslationKeys.id,
            key: schema.projectTranslationKeys.key,
            sourceText: schema.projectTranslationKeys.sourceText,
            repositorySourceFileId: schema.projectTranslationKeys.repositorySourceFileId,
            isHidden: schema.projectTranslationKeys.isHidden,
          })
          .from(schema.projectTranslationKeys)
          .where(
            and(
              eq(schema.projectTranslationKeys.organizationId, input.organizationId),
              eq(schema.projectTranslationKeys.projectId, input.projectId),
              inArray(schema.projectTranslationKeys.repositorySourceFileId, fileIds),
            ),
          );

  const visibleKeys = keys.filter((key) => !key.isHidden);
  const keyIds = visibleKeys.map((key) => key.id);
  const translations =
    keyIds.length === 0
      ? []
      : await client
          .select({
            translationKeyId: schema.projectTranslations.translationKeyId,
            targetLocale: schema.projectTranslations.targetLocale,
            text: schema.projectTranslations.text,
            status: schema.projectTranslations.status,
          })
          .from(schema.projectTranslations)
          .where(
            and(
              eq(schema.projectTranslations.organizationId, input.organizationId),
              eq(schema.projectTranslations.projectId, input.projectId),
              inArray(schema.projectTranslations.translationKeyId, keyIds),
            ),
          );

  const translationByKeyLocale = new Map<string, { text: string; status: string }>();
  for (const translation of translations) {
    const locale = canonicalizeLocale(translation.targetLocale) ?? translation.targetLocale;
    translationByKeyLocale.set(`${translation.translationKeyId}\0${locale}`, {
      text: translation.text,
      status: translation.status,
    });
  }

  const canonicalSource = input.sourceLocale
    ? (canonicalizeLocale(input.sourceLocale) ?? input.sourceLocale)
    : null;
  const allowedLocales = projectLocaleSet({
    sourceLocale: input.sourceLocale,
    targetLocales: [...input.locales],
  });

  const snapshotFiles: OtaSnapshotFile[] = [];
  for (const locale of input.locales) {
    const canonicalLocale = canonicalizeLocale(locale) ?? locale;
    if (!allowedLocales.has(canonicalLocale) && canonicalLocale !== canonicalSource) {
      continue;
    }

    for (const file of files) {
      const entries: Array<{ key: string; text: string }> = [];
      for (const key of visibleKeys) {
        if (key.repositorySourceFileId !== file.id) {
          continue;
        }

        if (canonicalSource && canonicalLocale === canonicalSource) {
          const sourceText = key.sourceText.trim();
          if (sourceText.length > 0) {
            entries.push({ key: key.key, text: sourceText });
          }
          continue;
        }

        const translation = translationByKeyLocale.get(`${key.id}\0${canonicalLocale}`);
        const text = translation?.text.trim() ?? "";
        if (translation?.status === "approved" && text.length > 0) {
          entries.push({ key: key.key, text });
        }
      }

      snapshotFiles.push({
        relativePath: `/content/${canonicalLocale}${file.exportPath}`,
        body: serializeOtaFile(input.format, entries),
      });
    }
  }

  return { manifest, files: snapshotFiles };
}
