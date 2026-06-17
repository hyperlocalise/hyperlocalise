import type { ProjectFileCatQuery } from "@/api/routes/project/project.schema";
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
  paginated: boolean;
};

export function resolveProjectFileCatPagination(
  query: Pick<ProjectFileCatQuery, "search" | "offset" | "limit">,
): ProjectFileCatPaginationInput {
  const hasPaginationParams =
    query.offset !== undefined || query.limit !== undefined || Boolean(query.search?.trim());

  if (!hasPaginationParams) {
    return {
      offset: 0,
      limit: legacyNativeCatSegmentLimit,
      search: undefined,
      paginated: false,
    };
  }

  return {
    offset: query.offset ?? 0,
    limit: Math.min(query.limit ?? defaultProjectFileCatPageLimit, maxProjectFileCatPageLimit),
    search: query.search?.trim() || undefined,
    paginated: true,
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
}) {
  const hasMore = input.offset + input.returnedCount < input.totalCount;

  return {
    offset: input.offset,
    limit: input.limit,
    returnedCount: input.returnedCount,
    totalCount: input.totalCount,
    hasMore,
  };
}
