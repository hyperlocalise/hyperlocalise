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
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";

export const CROWDIN_UNTRANSLATED_FIRST_BANDS = [
  "untranslated",
  "needs_review",
  "reviewed",
] as const;

export type CrowdinUntranslatedFirstBand = (typeof CROWDIN_UNTRANSLATED_FIRST_BANDS)[number];

/**
 * Status filters are already a single band, so untranslated-first can use one query.
 * Extra filters (All, Has issues, QA, comments, …) walk three CroQL buckets in order.
 */
export function crowdinQueueFilterUsesStatusBuckets(
  queueFilter: ProjectFileCatQueueFilter | undefined,
) {
  return (
    queueFilter !== "untranslated" && queueFilter !== "needs_review" && queueFilter !== "reviewed"
  );
}

export function shouldPaginateCrowdinUntranslatedFirst(input: {
  queueSort?: ProjectFileCatQueueSort;
  queueFilter?: ProjectFileCatQueueFilter;
}) {
  return (
    input.queueSort === "untranslated_first" &&
    crowdinQueueFilterUsesStatusBuckets(input.queueFilter)
  );
}

export async function paginateCatQueueSortBuckets<T>(input: {
  startBucketIndex?: number;
  startBucketOffset?: number;
  limit: number;
  fetchBand: (
    band: CrowdinUntranslatedFirstBand,
    offset: number,
    limit: number,
  ) => Promise<{ items: T[]; hasMore: boolean }>;
}): Promise<{
  items: T[];
  hasMore: boolean;
  nextSortBucket?: number;
  nextSortBucketOffset?: number;
}> {
  const limit = input.limit;
  const bands = CROWDIN_UNTRANSLATED_FIRST_BANDS;
  let bucketIndex = input.startBucketIndex ?? 0;
  let offset = input.startBucketOffset ?? 0;
  const items: T[] = [];

  if (limit <= 0 || bucketIndex >= bands.length) {
    return { items, hasMore: false };
  }

  while (items.length < limit && bucketIndex < bands.length) {
    const remaining = limit - items.length;
    const band = bands[bucketIndex];
    const page = await input.fetchBand(band, offset, remaining);

    if (page.items.length === 0) {
      if (page.hasMore) {
        // Empty page with more results would loop forever at the same offset.
        bucketIndex += 1;
        offset = 0;
        continue;
      }

      bucketIndex += 1;
      offset = 0;
      continue;
    }

    items.push(...page.items);

    if (items.length >= limit) {
      if (page.hasMore) {
        return {
          items,
          hasMore: true,
          nextSortBucket: bucketIndex,
          nextSortBucketOffset: offset + page.items.length,
        };
      }

      if (bucketIndex + 1 < bands.length) {
        return {
          items,
          hasMore: true,
          nextSortBucket: bucketIndex + 1,
          nextSortBucketOffset: 0,
        };
      }

      return { items, hasMore: false };
    }

    if (page.hasMore) {
      offset += page.items.length;
      continue;
    }

    bucketIndex += 1;
    offset = 0;
  }

  return { items, hasMore: false };
}
