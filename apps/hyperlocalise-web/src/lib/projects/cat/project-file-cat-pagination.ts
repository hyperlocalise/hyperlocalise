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
  ProjectFileCatQuery,
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";
import {
  defaultProjectFileCatPageLimit,
  legacyProviderCatSegmentLimit,
  maxProjectFileCatPageLimit,
} from "@/api/routes/project/project.schema";

export type ProjectFileCatPaginationInput = {
  offset: number;
  limit: number;
  search?: string;
  queueFilter?: ProjectFileCatQueueFilter;
  queueSort?: ProjectFileCatQueueSort;
  paginated: boolean;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sortBucket?: number;
  sortBucketOffset?: number;
};

function normalizeQueueFilter(
  queueFilter: ProjectFileCatQueueFilter | undefined,
): ProjectFileCatQueueFilter {
  return queueFilter ?? "all";
}

function normalizeQueueSort(
  queueSort: ProjectFileCatQueueSort | undefined,
): ProjectFileCatQueueSort {
  return queueSort ?? "file_order";
}

export function resolveProjectFileCatPagination(
  query: Pick<
    ProjectFileCatQuery,
    | "search"
    | "offset"
    | "limit"
    | "queueFilter"
    | "queueSort"
    | "phraseScanPage"
    | "phraseScanSkip"
    | "sortBucket"
    | "sortBucketOffset"
  >,
): ProjectFileCatPaginationInput {
  const queueFilter = normalizeQueueFilter(query.queueFilter);
  const queueSort = normalizeQueueSort(query.queueSort);
  const hasPaginationParams =
    query.offset !== undefined ||
    query.limit !== undefined ||
    Boolean(query.search?.trim()) ||
    queueFilter !== "all" ||
    queueSort !== "file_order";

  if (!hasPaginationParams) {
    return {
      offset: 0,
      limit: defaultProjectFileCatPageLimit,
      search: undefined,
      queueFilter: "all",
      queueSort: "file_order",
      paginated: true,
    };
  }

  return {
    offset: query.offset ?? 0,
    limit: Math.min(query.limit ?? defaultProjectFileCatPageLimit, maxProjectFileCatPageLimit),
    search: query.search?.trim() || undefined,
    queueFilter,
    queueSort,
    paginated: true,
    phraseScanPage: query.phraseScanPage,
    phraseScanSkip: query.phraseScanSkip,
    sortBucket: query.sortBucket,
    sortBucketOffset: query.sortBucketOffset,
  };
}

export function resolveProviderLegacyCatLimit(paginated: boolean) {
  return paginated ? maxProjectFileCatPageLimit : legacyProviderCatSegmentLimit;
}

export function buildCatFilePagination(input: {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore?: boolean;
  nextPhraseScanPage?: number;
  nextPhraseScanSkip?: number;
  nextSortBucket?: number;
  nextSortBucketOffset?: number;
}) {
  const hasMore = input.hasMore ?? input.offset + input.returnedCount < input.totalCount;

  return {
    offset: input.offset,
    limit: input.limit,
    returnedCount: input.returnedCount,
    totalCount: input.totalCount,
    hasMore,
    ...(input.nextPhraseScanPage != null ? { nextPhraseScanPage: input.nextPhraseScanPage } : {}),
    ...(input.nextPhraseScanSkip != null ? { nextPhraseScanSkip: input.nextPhraseScanSkip } : {}),
    ...(input.nextSortBucket != null ? { nextSortBucket: input.nextSortBucket } : {}),
    ...(input.nextSortBucketOffset != null
      ? { nextSortBucketOffset: input.nextSortBucketOffset }
      : {}),
  };
}
