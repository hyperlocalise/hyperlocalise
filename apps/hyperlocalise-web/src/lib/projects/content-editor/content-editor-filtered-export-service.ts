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
import type { AuthVariables } from "@/api/auth/workos";
import type {
  ProjectFileContentEditorQuery,
  ProjectFileContentEditorQueueFile,
  ProjectFileContentEditorSegment,
} from "@/api/routes/project/project.schema";
import type { ProjectResourceTarget } from "@/api/routes/project/project.shared";
import { maxProjectFileContentEditorPageLimit } from "@/api/routes/project/project.schema";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { getProjectTranslationsByKeyIds } from "@/lib/projects/translations/project-translation-service";
import { getTmsProviderLiveCatSegmentTarget } from "@/lib/providers/jobs/tms-provider-live";

import {
  buildCatFilteredExportFilename,
  maxCatFilteredExportSegments,
  serializeCatFilteredExport,
  type ContentEditorFilteredExportFormat,
  type ContentEditorFilteredExportRow,
} from "./content-editor-filtered-export";

export type ContentEditorQueueLoaderResult =
  | { kind: "ok"; contentEditorQueue: ProjectFileContentEditorQueueFile }
  | { kind: "feature_unavailable" }
  | {
      kind: "provider_unavailable";
      target: Extract<ProjectResourceTarget, { kind: "provider_unavailable" }>;
    }
  | { kind: "project_not_found" }
  | { kind: "source_file_not_found" }
  | { kind: "provider_error"; error: unknown };

export type ContentEditorQueueLoader = (
  auth: AuthVariables["auth"],
  projectId: string,
  query: ProjectFileContentEditorQuery,
) => Promise<ContentEditorQueueLoaderResult>;

const PROVIDER_TARGET_CONCURRENCY = 8;

async function loadNativeTargets(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  segments: ProjectFileContentEditorSegment[];
}) {
  const keyIds = input.segments.map((segment) => segment.externalStringId);
  const translations = await getProjectTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: keyIds,
    targetLocale: input.targetLocale,
  });
  return new Map(translations.map((row) => [row.translationKeyId, row.text ?? ""]));
}

async function loadProviderTargets(input: {
  organizationId: string;
  externalProjectId: string;
  sourcePath: string;
  targetLocale: string;
  actorUserId?: string | null;
  segments: ProjectFileContentEditorSegment[];
}) {
  const targets = await mapWithConcurrency(
    input.segments,
    PROVIDER_TARGET_CONCURRENCY,
    async (segment) => {
      const target = await getTmsProviderLiveCatSegmentTarget(
        input.organizationId,
        input.externalProjectId,
        segment.sourcePath ?? input.sourcePath,
        input.targetLocale,
        segment.externalStringId,
        {
          actorUserId: input.actorUserId,
          externalResourceId: segment.externalResourceId,
          resourceType: segment.resourceType,
        },
      );
      const text = target && target !== "not_found" ? (target.text ?? "") : "";
      return [segment.externalStringId, text] as const;
    },
  );

  return new Map(targets);
}

export async function collectCatFilteredExportRows(input: {
  auth: AuthVariables["auth"];
  projectId: string;
  query: ProjectFileContentEditorQuery;
  sourceLocale: string;
  loadCatQueue: ContentEditorQueueLoader;
  externalProjectId?: string | null;
}): Promise<
  | { kind: "ok"; rows: ContentEditorFilteredExportRow[]; truncated: boolean }
  | { kind: "empty" }
  | Exclude<ContentEditorQueueLoaderResult, { kind: "ok" }>
> {
  const rows: ContentEditorFilteredExportRow[] = [];
  let offset = input.query.offset ?? 0;
  let phraseScanPage = input.query.phraseScanPage;
  let phraseScanSkip = input.query.phraseScanSkip;
  let sortBucket = input.query.sortBucket;
  let sortBucketOffset = input.query.sortBucketOffset;
  let truncated = false;
  const isProvider = Boolean(input.externalProjectId);

  while (rows.length < maxCatFilteredExportSegments) {
    const remaining = maxCatFilteredExportSegments - rows.length;
    const limit = Math.min(maxProjectFileContentEditorPageLimit, remaining);
    const pageResult = await input.loadCatQueue(input.auth, input.projectId, {
      ...input.query,
      offset,
      limit,
      phraseScanPage,
      phraseScanSkip,
      sortBucket,
      sortBucketOffset,
    });

    if (pageResult.kind !== "ok") {
      return pageResult;
    }

    const { contentEditorQueue } = pageResult;
    if (contentEditorQueue.segments.length === 0) {
      break;
    }

    const targetById = isProvider
      ? await loadProviderTargets({
          organizationId: input.auth.organization.localOrganizationId,
          externalProjectId: input.externalProjectId!,
          sourcePath: input.query.sourcePath,
          targetLocale: input.query.targetLocale,
          actorUserId: input.auth.user.localUserId,
          segments: contentEditorQueue.segments,
        })
      : await loadNativeTargets({
          organizationId: input.auth.organization.localOrganizationId,
          projectId: input.projectId,
          targetLocale: input.query.targetLocale,
          segments: contentEditorQueue.segments,
        });

    for (const segment of contentEditorQueue.segments) {
      rows.push({
        key: segment.key,
        sourceText: segment.sourceText,
        targetText: targetById.get(segment.externalStringId) ?? "",
        sourceLocale: input.sourceLocale,
        targetLocale: input.query.targetLocale,
        sourcePath: segment.sourcePath ?? input.query.sourcePath,
      });
    }

    const pagination = contentEditorQueue.pagination;
    if (!pagination?.hasMore) {
      break;
    }

    offset = pagination.offset + pagination.returnedCount;
    phraseScanPage = pagination.nextPhraseScanPage;
    phraseScanSkip = pagination.nextPhraseScanSkip;
    sortBucket = pagination.nextSortBucket;
    sortBucketOffset = pagination.nextSortBucketOffset;

    if (rows.length >= maxCatFilteredExportSegments && pagination.hasMore) {
      truncated = true;
      break;
    }
  }

  if (rows.length === 0) {
    return { kind: "empty" };
  }

  return { kind: "ok", rows, truncated };
}

export function buildCatFilteredExportPayload(input: {
  format: ContentEditorFilteredExportFormat;
  rows: ContentEditorFilteredExportRow[];
  sourcePath: string;
  targetLocale: string;
}) {
  const serialized = serializeCatFilteredExport(input.format, input.rows);
  return {
    ...serialized,
    filename: buildCatFilteredExportFilename({
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      extension: serialized.extension,
    }),
  };
}
