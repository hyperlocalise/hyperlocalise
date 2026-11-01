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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { requestSourceFileReingest } from "@/lib/projects/files/source-file-segmentation";
import {
  normalizeImportSettings,
  repositorySourceFileImportSettingsSchema,
  sourcePathImportKind,
  type RepositorySourceFileImportSettings,
} from "@/lib/projects/files/source-file-import-settings-schema";

export {
  defaultRepositorySourceFileImportSettings,
  importSettingsAreActive,
  normalizeImportSettings,
  repositorySourceFileImportSettingsSchema,
  sourcePathImportKind,
  type RepositorySourceFileImportSettings,
} from "@/lib/projects/files/source-file-import-settings-schema";

export async function getRepositorySourceFileImportSettings(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const [row] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      importSettings: schema.repositorySourceFiles.importSettings,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, sourcePath),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    repositorySourceFileId: row.id,
    sourcePath,
    kind: sourcePathImportKind(sourcePath),
    importSettings: normalizeImportSettings(row.importSettings),
  };
}

export async function updateRepositorySourceFileImportSettings(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  settings: RepositorySourceFileImportSettings;
}) {
  const parsed = repositorySourceFileImportSettingsSchema.parse(input.settings);
  const sourcePath = normalizeSourcePath(input.sourcePath);

  const [file] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      reconciledSourceFileVersionId: schema.repositorySourceFiles.reconciledSourceFileVersionId,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, sourcePath),
      ),
    )
    .limit(1);

  if (!file) {
    return { ok: false as const, error: "source_file_not_found" as const };
  }

  await db
    .update(schema.repositorySourceFiles)
    .set({ importSettings: parsed })
    .where(eq(schema.repositorySourceFiles.id, file.id));

  const reingest = await requestSourceFileReingest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: file.id,
    reconciledSourceFileVersionId: file.reconciledSourceFileVersionId,
  });

  return {
    ok: true as const,
    importSettings: parsed,
    kind: sourcePathImportKind(sourcePath),
    reingest,
  };
}

export async function loadImportSettingsForIngest(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
}) {
  const [row] = await db
    .select({ importSettings: schema.repositorySourceFiles.importSettings })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.id, input.repositorySourceFileId),
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
      ),
    )
    .limit(1);

  return normalizeImportSettings(row?.importSettings);
}
