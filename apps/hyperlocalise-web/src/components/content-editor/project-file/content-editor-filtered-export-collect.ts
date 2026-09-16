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
import type {
  ProjectFileContentEditorQueueFilter,
  ProjectFileContentEditorQueueSort,
  ProjectFileContentEditorSegment,
} from "@/api/routes/project/project.schema";
import { maxProjectFileContentEditorPageLimit } from "@/api/routes/project/project.schema";
import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { fetchProjectFileContentEditorQueuePage } from "@/components/content-editor/project-file/project-file-content-editor-api";
import { fetchProjectFileContentEditorSegmentTarget } from "@/components/content-editor/project-file/use-content-editor-segment-target";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  maxCatFilteredExportSegments,
  type ContentEditorFilteredExportRow,
} from "@/lib/projects/content-editor/content-editor-filtered-export";

const SEGMENT_TARGET_CONCURRENCY = 8;

export type ContentEditorFilteredExportCollectDeps = {
  loadQueuePage: typeof fetchProjectFileContentEditorQueuePage;
  loadSegmentTarget: typeof fetchProjectFileContentEditorSegmentTarget;
};

const defaultCollectDeps: ContentEditorFilteredExportCollectDeps = {
  loadQueuePage: fetchProjectFileContentEditorQueuePage,
  loadSegmentTarget: fetchProjectFileContentEditorSegmentTarget,
};

async function loadPageTargets(input: {
  deps: ContentEditorFilteredExportCollectDeps;
  organizationSlug: string;
  projectId: string;
  defaultSourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  segments: ProjectFileContentEditorSegment[];
  intl: ContentEditorFormatMessageIntl;
}) {
  const pairs = await mapWithConcurrency(
    input.segments,
    SEGMENT_TARGET_CONCURRENCY,
    async (segment) => {
      const sourcePath = segment.sourcePath ?? input.defaultSourcePath;
      const target = await input.deps.loadSegmentTarget({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath,
        externalResourceId: segment.externalResourceId ?? input.externalResourceId,
        resourceType: segment.resourceType ?? input.resourceType,
        targetLocale: input.targetLocale,
        externalStringId: segment.externalStringId,
        intl: input.intl,
      });
      const text = target?.text ?? "";
      return [segment.externalStringId, text] as const;
    },
  );

  return new Map(pairs);
}

export async function collectCatFilteredExportRows(
  input: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    sourceLocale: string;
    search: string;
    queueFilter: ProjectFileContentEditorQueueFilter;
    queueSort?: ProjectFileContentEditorQueueSort;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    sourcePaths?: string | null;
    intl: ContentEditorFormatMessageIntl;
  },
  deps: ContentEditorFilteredExportCollectDeps = defaultCollectDeps,
): Promise<
  { kind: "ok"; rows: ContentEditorFilteredExportRow[]; truncated: boolean } | { kind: "empty" }
> {
  const rows: ContentEditorFilteredExportRow[] = [];
  let offset = 0;
  let phraseScanPage: number | undefined;
  let phraseScanSkip: number | undefined;
  let sortBucket: number | undefined;
  let sortBucketOffset: number | undefined;
  let truncated = false;
  const queueSort = input.queueSort ?? "file_order";

  while (rows.length < maxCatFilteredExportSegments) {
    const remaining = maxCatFilteredExportSegments - rows.length;
    const limit = Math.min(maxProjectFileContentEditorPageLimit, remaining);
    const contentEditorQueue = await deps.loadQueuePage({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      sourcePaths: input.sourcePaths,
      targetLocale: input.targetLocale,
      search: input.search,
      queueFilter: input.queueFilter,
      queueSort,
      limit,
      offset,
      phraseScanPage,
      phraseScanSkip,
      sortBucket,
      sortBucketOffset,
      intl: input.intl,
    });

    if (contentEditorQueue.segments.length === 0) {
      const pagination = contentEditorQueue.pagination;
      if (!pagination?.hasMore) {
        break;
      }

      const nextOffset = pagination.offset + pagination.returnedCount;
      const progressed =
        nextOffset > offset ||
        pagination.nextPhraseScanPage !== phraseScanPage ||
        pagination.nextPhraseScanSkip !== phraseScanSkip ||
        pagination.nextSortBucket !== sortBucket ||
        pagination.nextSortBucketOffset !== sortBucketOffset;
      if (!progressed) {
        break;
      }

      offset = nextOffset;
      phraseScanPage = pagination.nextPhraseScanPage;
      phraseScanSkip = pagination.nextPhraseScanSkip;
      sortBucket = pagination.nextSortBucket;
      sortBucketOffset = pagination.nextSortBucketOffset;
      continue;
    }

    const targetById = await loadPageTargets({
      deps,
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      defaultSourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      targetLocale: input.targetLocale,
      segments: contentEditorQueue.segments,
      intl: input.intl,
    });

    for (const segment of contentEditorQueue.segments) {
      rows.push({
        key: segment.key,
        sourceText: segment.sourceText,
        targetText: targetById.get(segment.externalStringId) ?? "",
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourcePath: segment.sourcePath ?? input.sourcePath,
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
