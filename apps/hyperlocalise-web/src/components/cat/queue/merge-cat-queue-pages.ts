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
import type { ProjectFileCatQueuePage } from "@/components/cat/project-file/project-file-cat-api";

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
