import type {
  ProjectFileCatQuery,
  ProjectFileCatQueueFilter,
} from "@/api/routes/project/project.schema";
import {
  defaultProjectFileCatPageLimit,
  legacyNativeCatSegmentLimit,
  legacyProviderCatSegmentLimit,
  maxProjectFileCatPageLimit,
} from "@/api/routes/project/project.schema";

export type ProjectFileCatPaginationInput = {
  offset: number;
  limit: number;
  search?: string;
  queueFilter?: ProjectFileCatQueueFilter;
  paginated: boolean;
};

function normalizeQueueFilter(
  queueFilter: ProjectFileCatQueueFilter | undefined,
): ProjectFileCatQueueFilter {
  return queueFilter ?? "all";
}

export function resolveProjectFileCatPagination(
  query: Pick<ProjectFileCatQuery, "search" | "offset" | "limit" | "queueFilter">,
): ProjectFileCatPaginationInput {
  const queueFilter = normalizeQueueFilter(query.queueFilter);
  const hasPaginationParams =
    query.offset !== undefined ||
    query.limit !== undefined ||
    Boolean(query.search?.trim()) ||
    queueFilter !== "all";

  if (!hasPaginationParams) {
    return {
      offset: 0,
      limit: legacyNativeCatSegmentLimit,
      search: undefined,
      queueFilter: "all",
      paginated: false,
    };
  }

  return {
    offset: query.offset ?? 0,
    limit: Math.min(query.limit ?? defaultProjectFileCatPageLimit, maxProjectFileCatPageLimit),
    search: query.search?.trim() || undefined,
    queueFilter,
    paginated: true,
  };
}

export function resolveProviderLegacyCatLimit(paginated: boolean) {
  return paginated ? maxProjectFileCatPageLimit : legacyProviderCatSegmentLimit;
}

export function resolveProjectFileCatIncludeQueueSummary(
  query: Pick<ProjectFileCatQuery, "includeQueueSummary">,
) {
  return query.includeQueueSummary !== "false";
}

export function buildCatFilePagination(input: {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore?: boolean;
}) {
  const hasMore = input.hasMore ?? input.offset + input.returnedCount < input.totalCount;

  return {
    offset: input.offset,
    limit: input.limit,
    returnedCount: input.returnedCount,
    totalCount: input.totalCount,
    hasMore,
  };
}
