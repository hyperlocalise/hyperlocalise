import type { ProjectFileCatQueuePage } from "./project-file-cat-api";

export function mergeCatQueuePages(
  pages: ProjectFileCatQueuePage[],
): ProjectFileCatQueuePage | null {
  if (pages.length === 0) {
    return null;
  }

  const firstPage = pages[0];
  const lastPage = pages.at(-1);
  if (!lastPage) {
    return null;
  }

  const seen = new Set<string>();
  const segments: ProjectFileCatQueuePage["segments"] = [];

  for (const page of pages) {
    for (const segment of page.segments) {
      if (seen.has(segment.externalStringId)) {
        continue;
      }

      seen.add(segment.externalStringId);
      segments.push(segment);
    }
  }

  const lastPagination = lastPage.pagination;

  return {
    ...firstPage,
    segments,
    truncated: lastPagination?.hasMore ?? false,
    pagination: lastPagination
      ? {
          offset: 0,
          limit: lastPagination.limit,
          returnedCount: segments.length,
          totalCount: lastPagination.hasMore ? segments.length + 1 : segments.length,
          hasMore: lastPagination.hasMore,
        }
      : undefined,
  };
}
