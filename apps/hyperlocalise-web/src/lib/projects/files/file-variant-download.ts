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
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { inferSupportedVideoTranslationFileFormat } from "@/lib/translation/file-formats";

export type ProjectFileVariantDownload = {
  body: ReadableStream;
  contentType: string;
  /** Name the variant's file was stored under. */
  storedFilename: string;
};

type FileVariantLookup = {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  locale: string;
};

/** Video variants are kept apart from those of images, documents, and office files. */
async function findFileVariantStoredFileId(input: FileVariantLookup): Promise<string | null> {
  if (inferSupportedVideoTranslationFileFormat(input.sourcePath)) {
    const [variant] = await db
      .select({ storedFileId: schema.projectVideoVariants.storedFileId })
      .from(schema.projectVideoVariants)
      .where(
        and(
          eq(schema.projectVideoVariants.organizationId, input.organizationId),
          eq(schema.projectVideoVariants.projectId, input.projectId),
          eq(schema.projectVideoVariants.sourcePath, input.sourcePath),
          eq(schema.projectVideoVariants.targetLocale, input.locale),
        ),
      )
      .limit(1);
    return variant?.storedFileId ?? null;
  }

  const [variant] = await db
    .select({ storedFileId: schema.projectImageVariants.storedFileId })
    .from(schema.projectImageVariants)
    .where(
      and(
        eq(schema.projectImageVariants.organizationId, input.organizationId),
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        eq(schema.projectImageVariants.targetLocale, input.locale),
      ),
    )
    .limit(1);
  return variant?.storedFileId ?? null;
}

/**
 * The file variant saved as a source file's translation in one locale, whatever its review
 * status. Images, documents, office files, and video are translated as whole files and have
 * no string keys. Returns null when no file has been saved for the locale.
 */
export async function loadProjectFileVariant(
  input: FileVariantLookup & { fileStorageAdapter?: FileStorageAdapter },
): Promise<ProjectFileVariantDownload | null> {
  const storedFileId = await findFileVariantStoredFileId(input);
  if (!storedFileId) {
    return null;
  }

  const [file] = await db
    .select({
      storageKey: schema.storedFiles.storageKey,
      contentType: schema.storedFiles.contentType,
      filename: schema.storedFiles.filename,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.id, storedFileId),
        eq(schema.storedFiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!file) {
    return null;
  }

  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const storedObject = await adapter.get({ keyOrUrl: file.storageKey });
  if (!storedObject) {
    return null;
  }

  return {
    body: storedObject.body,
    contentType: storedObject.contentType ?? file.contentType ?? "application/octet-stream",
    storedFilename: file.filename,
  };
}

/**
 * `guide.docx` in `de-DE` downloads as `guide-de-DE.docx`. The extension is the stored file's
 * where it has one, because a variant can be another type than its source: an `.xls`
 * workbook is saved as `.xlsx`, and an uploaded image need not match the source image's type.
 */
export function fileVariantDownloadName(input: {
  sourcePath: string;
  locale: string;
  storedFilename: string;
}): string {
  const sourceExtension = path.extname(input.sourcePath);
  const baseName = path.basename(input.sourcePath, sourceExtension);
  const localized = baseName.endsWith(`-${input.locale}`)
    ? baseName
    : `${baseName}-${input.locale}`;
  return `${localized}${path.extname(input.storedFilename) || sourceExtension}`;
}
