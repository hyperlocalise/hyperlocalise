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
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/database/client";
import type { RepositorySourceFileSegmentationSettings } from "@/lib/database/schema/files";
import { defaultRepositorySourceFileSegmentationSettings } from "@/lib/database/schema/files";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import {
  SRX_BUILTIN_TEMPLATES,
  SRX_CUSTOM_SANDBOX_FILENAME,
  type SrxBuiltinTemplate,
} from "@/lib/i18n/srx/srx-template-samples";
import { sourcePathSupportsSrxSegmentation } from "@/lib/i18n/srx/format-supports";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";

export const repositorySourceFileSegmentationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    template: z.enum(["default", "html", "markdown", "custom"]),
    customSrxXml: z.string().max(500_000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }
    if (value.template === "custom") {
      const xml = value.customSrxXml?.trim() ?? "";
      if (!xml.startsWith("<")) {
        ctx.addIssue({
          code: "custom",
          message: "Custom SRX rules must be XML",
          path: ["customSrxXml"],
        });
      }
    }
  });

export type RepositorySourceFileSegmentationSettingsInput = z.infer<
  typeof repositorySourceFileSegmentationSettingsSchema
>;

export function normalizeSegmentationSettings(
  raw: RepositorySourceFileSegmentationSettings | null | undefined,
): RepositorySourceFileSegmentationSettings {
  if (!raw) {
    return defaultRepositorySourceFileSegmentationSettings();
  }
  const template = SRX_BUILTIN_TEMPLATES.includes(raw.template as SrxBuiltinTemplate)
    ? raw.template
    : raw.template === "custom"
      ? "custom"
      : "default";
  return {
    enabled: Boolean(raw.enabled),
    template,
    customSrxXml: raw.customSrxXml ?? null,
  };
}

export function resolveSandboxSrxCliSpec(settings: RepositorySourceFileSegmentationSettings): {
  srxFlag?: string;
  customSandboxPath?: string;
  customSandboxContent?: string;
} {
  if (!settings.enabled) {
    return {};
  }
  if (settings.template === "custom") {
    const xml = settings.customSrxXml?.trim() ?? "";
    if (!xml) {
      return {};
    }
    return {
      srxFlag: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxPath: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxContent: xml,
    };
  }
  return { srxFlag: settings.template };
}

export async function getRepositorySourceFileSegmentation(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const [row] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      segmentationSettings: schema.repositorySourceFiles.segmentationSettings,
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
    supportsSegmentation: sourcePathSupportsSrxSegmentation(sourcePath),
    segmentation: normalizeSegmentationSettings(row.segmentationSettings),
  };
}

export async function updateRepositorySourceFileSegmentation(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  settings: RepositorySourceFileSegmentationSettingsInput;
}) {
  const parsed = repositorySourceFileSegmentationSettingsSchema.parse(input.settings);
  const sourcePath = normalizeSourcePath(input.sourcePath);

  const normalized: RepositorySourceFileSegmentationSettings = {
    enabled: parsed.enabled,
    template: parsed.template,
    customSrxXml:
      parsed.enabled && parsed.template === "custom" ? (parsed.customSrxXml?.trim() ?? null) : null,
  };

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
    .set({
      segmentationSettings: normalized,
      reconciledSourceFileVersionId: null,
    })
    .where(eq(schema.repositorySourceFiles.id, file.id));

  const reingest = await requestSourceFileReingest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: file.id,
    reconciledSourceFileVersionId: file.reconciledSourceFileVersionId,
  });

  return {
    ok: true as const,
    segmentation: normalized,
    supportsSegmentation: sourcePathSupportsSrxSegmentation(sourcePath),
    reingest,
  };
}

async function requestSourceFileReingest(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  reconciledSourceFileVersionId: string | null;
}) {
  const versionId = input.reconciledSourceFileVersionId;
  if (!versionId) {
    return { queued: false as const, reason: "no_reconciled_version" as const };
  }

  const [version] = await db
    .select({
      id: schema.repositorySourceFileVersions.id,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
      storedFileId: schema.repositorySourceFileVersions.storedFileId,
      sourceHash: schema.repositorySourceFileVersions.sourceHash,
      ingestState: schema.repositorySourceFileVersions.ingestState,
    })
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.id, versionId),
        eq(
          schema.repositorySourceFileVersions.repositorySourceFileId,
          input.repositorySourceFileId,
        ),
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!version) {
    return { queued: false as const, reason: "version_not_found" as const };
  }

  if (version.ingestState === "ingesting") {
    return { queued: false as const, reason: "already_ingesting" as const };
  }

  await db
    .update(schema.repositorySourceFileVersions)
    .set({
      ingestState: "pending",
      ingestError: null,
      ingestWorkflowRunId: null,
      ingestedAt: null,
    })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));

  await enqueueSourceFileIngestAfterUpload({
    organizationId: input.organizationId,
    projectId: input.projectId,
    storedFileId: version.storedFileId,
    sourceFileVersionId: version.id,
    sourcePath: version.sourcePath,
    sourceHash: version.sourceHash,
  });

  return { queued: true as const, sourceFileVersionId: version.id };
}

export async function loadSegmentationForIngest(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
}) {
  const [row] = await db
    .select({ segmentationSettings: schema.repositorySourceFiles.segmentationSettings })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.id, input.repositorySourceFileId),
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
      ),
    )
    .limit(1);

  return normalizeSegmentationSettings(row?.segmentationSettings);
}

export async function findLatestReconciledVersionForFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const [file] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      reconciledSourceFileVersionId: schema.repositorySourceFiles.reconciledSourceFileVersionId,
      segmentationSettings: schema.repositorySourceFiles.segmentationSettings,
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
    return null;
  }

  let versionId = file.reconciledSourceFileVersionId;
  if (!versionId) {
    const [latest] = await db
      .select({ id: schema.repositorySourceFileVersions.id })
      .from(schema.repositorySourceFileVersions)
      .where(
        and(
          eq(schema.repositorySourceFileVersions.repositorySourceFileId, file.id),
          eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        ),
      )
      .orderBy(
        desc(schema.repositorySourceFileVersions.createdAt),
        desc(schema.repositorySourceFileVersions.id),
      )
      .limit(1);
    versionId = latest?.id ?? null;
  }

  return {
    repositorySourceFileId: file.id,
    segmentation: normalizeSegmentationSettings(file.segmentationSettings),
    reconciledSourceFileVersionId: versionId,
  };
}
