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
  ProjectFileCatGroupOccurrence,
  ProjectFileCatQuery,
  ProjectFileCatQueueFile,
  ProjectFileCatSegment,
} from "@/api/routes/project/project.schema";
import type { ProjectResourceTarget } from "@/api/routes/project/project.shared";
import { maxProjectFileCatPageLimit } from "@/api/routes/project/project.schema";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isCatQueueGroup, isCatQueueSegmentRow } from "@/lib/projects/cat/cat-queue-row";
import { getNativeProjectCatGroupOccurrences } from "@/lib/projects/cat/native-cat-service";
import { getProjectTranslationsByKeyIds } from "@/lib/projects/translations/project-translation-service";
import { getTmsProviderLiveCatSegmentTarget } from "@/lib/providers/jobs/tms-provider-live";

import {
  buildCatFilteredExportFilename,
  maxCatFilteredExportSegments,
  serializeCatFilteredExport,
  type CatFilteredExportFormat,
  type CatFilteredExportRow,
} from "./cat-filtered-export";

export type CatQueueLoaderResult =
  | { kind: "ok"; catQueue: ProjectFileCatQueueFile }
  | { kind: "feature_unavailable" }
  | {
      kind: "provider_unavailable";
      target: Extract<ProjectResourceTarget, { kind: "provider_unavailable" }>;
    }
  | { kind: "project_not_found" }
  | { kind: "source_file_not_found" }
  | { kind: "provider_error"; error: unknown };

export type CatQueueLoader = (
  auth: AuthVariables["auth"],
  projectId: string,
  query: ProjectFileCatQuery,
) => Promise<CatQueueLoaderResult>;

const PROVIDER_TARGET_CONCURRENCY = 8;

export type CatGroupOccurrencesLoader = (input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  groupId: string;
  sourceTextHash: string;
}) => Promise<ProjectFileCatGroupOccurrence[] | null>;

async function loadNativeTargets(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  segments: ProjectFileCatSegment[];
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
  segments: ProjectFileCatSegment[];
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
  query: ProjectFileCatQuery;
  sourceLocale: string;
  loadCatQueue: CatQueueLoader;
  externalProjectId?: string | null;
  loadGroupOccurrences?: CatGroupOccurrencesLoader;
}): Promise<
  | { kind: "ok"; rows: CatFilteredExportRow[]; truncated: boolean }
  | { kind: "empty" }
  | Exclude<CatQueueLoaderResult, { kind: "ok" }>
> {
  const rows: CatFilteredExportRow[] = [];
  let offset = input.query.offset ?? 0;
  let phraseScanPage = input.query.phraseScanPage;
  let phraseScanSkip = input.query.phraseScanSkip;
  let sortBucket = input.query.sortBucket;
  let sortBucketOffset = input.query.sortBucketOffset;
  let truncated = false;
  const isProvider = Boolean(input.externalProjectId);

  while (rows.length < maxCatFilteredExportSegments) {
    const remaining = maxCatFilteredExportSegments - rows.length;
    const limit = Math.min(maxProjectFileCatPageLimit, remaining);
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

    const { catQueue } = pageResult;
    if (catQueue.segments.length === 0) {
      break;
    }

    const singletonSegments = catQueue.segments.filter(isCatQueueSegmentRow);
    const targetById = isProvider
      ? await loadProviderTargets({
          organizationId: input.auth.organization.localOrganizationId,
          externalProjectId: input.externalProjectId!,
          sourcePath: input.query.sourcePath,
          targetLocale: input.query.targetLocale,
          actorUserId: input.auth.user.localUserId,
          segments: singletonSegments,
        })
      : await loadNativeTargets({
          organizationId: input.auth.organization.localOrganizationId,
          projectId: input.projectId,
          targetLocale: input.query.targetLocale,
          segments: singletonSegments,
        });
    const loadGroupOccurrences =
      input.loadGroupOccurrences ?? getNativeProjectCatGroupOccurrences;

    for (const segment of catQueue.segments) {
      if (isCatQueueGroup(segment)) {
        const occurrences = await loadGroupOccurrences({
          organizationId: input.auth.organization.localOrganizationId,
          projectId: input.projectId,
          targetLocale: input.query.targetLocale,
          groupId: segment.groupId,
          sourceTextHash: segment.sourceTextHash,
        });
        if (!occurrences) {
          continue;
        }
        for (const occurrence of occurrences) {
          rows.push({
            key: occurrence.key,
            sourceText: segment.sourceText,
            targetText: occurrence.target?.text ?? "",
            sourceLocale: input.sourceLocale,
            targetLocale: input.query.targetLocale,
            sourcePath: occurrence.sourcePath,
          });
        }
        continue;
      }

      rows.push({
        key: segment.key,
        sourceText: segment.sourceText,
        targetText: targetById.get(segment.externalStringId) ?? "",
        sourceLocale: input.sourceLocale,
        targetLocale: input.query.targetLocale,
        sourcePath: segment.sourcePath ?? input.query.sourcePath,
      });
    }

    const pagination = catQueue.pagination;
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
  format: CatFilteredExportFormat;
  rows: CatFilteredExportRow[];
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
