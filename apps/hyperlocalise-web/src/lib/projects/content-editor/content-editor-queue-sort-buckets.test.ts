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
import { describe, expect, it } from "vite-plus/test";

import {
  crowdinQueueFilterUsesStatusBuckets,
  paginateCatQueueSortBuckets,
  shouldPaginateCrowdinUntranslatedFirst,
  type CrowdinUntranslatedFirstBand,
} from "./content-editor-queue-sort-buckets";

describe("crowdinQueueFilterUsesStatusBuckets", () => {
  it("skips buckets for status filters that are already a single band", () => {
    expect(crowdinQueueFilterUsesStatusBuckets("untranslated")).toBe(false);
    expect(crowdinQueueFilterUsesStatusBuckets("needs_review")).toBe(false);
    expect(crowdinQueueFilterUsesStatusBuckets("reviewed")).toBe(false);
  });

  it("uses buckets for All and extra Crowdin filters", () => {
    expect(crowdinQueueFilterUsesStatusBuckets("all")).toBe(true);
    expect(crowdinQueueFilterUsesStatusBuckets("has_issues")).toBe(true);
    expect(crowdinQueueFilterUsesStatusBuckets("qa_issues")).toBe(true);
    expect(crowdinQueueFilterUsesStatusBuckets("machine_translated")).toBe(true);
    expect(crowdinQueueFilterUsesStatusBuckets("with_comments")).toBe(true);
    expect(crowdinQueueFilterUsesStatusBuckets("hidden")).toBe(true);
  });
});

describe("shouldPaginateCrowdinUntranslatedFirst", () => {
  it("requires untranslated-first sort and a multi-band filter", () => {
    expect(
      shouldPaginateCrowdinUntranslatedFirst({
        queueSort: "untranslated_first",
        queueFilter: "all",
      }),
    ).toBe(true);
    expect(
      shouldPaginateCrowdinUntranslatedFirst({
        queueSort: "untranslated_first",
        queueFilter: "untranslated",
      }),
    ).toBe(false);
    expect(
      shouldPaginateCrowdinUntranslatedFirst({
        queueSort: "file_order",
        queueFilter: "all",
      }),
    ).toBe(false);
  });
});

describe("paginateCatQueueSortBuckets", () => {
  function createFetcher(pages: Record<CrowdinUntranslatedFirstBand, string[][]>) {
    const offsets = new Map<CrowdinUntranslatedFirstBand, number>();

    return async (band: CrowdinUntranslatedFirstBand, offset: number, limit: number) => {
      const bandPages = pages[band] ?? [];
      const flat = bandPages.flat();
      const slice = flat.slice(offset, offset + limit);
      offsets.set(band, offset);
      return {
        items: slice,
        hasMore: offset + slice.length < flat.length,
      };
    };
  }

  it("fills a page from the first band", async () => {
    const result = await paginateCatQueueSortBuckets({
      limit: 2,
      fetchBand: createFetcher({
        untranslated: [["a", "b", "c"]],
        needs_review: [["d"]],
        reviewed: [["e"]],
      }),
    });

    expect(result).toEqual({
      items: ["a", "b"],
      hasMore: true,
      nextSortBucket: 0,
      nextSortBucketOffset: 2,
    });
  });

  it("walks into the next band when the first band is short", async () => {
    const result = await paginateCatQueueSortBuckets({
      limit: 3,
      fetchBand: createFetcher({
        untranslated: [["a"]],
        needs_review: [["b", "c", "d"]],
        reviewed: [["e"]],
      }),
    });

    expect(result).toEqual({
      items: ["a", "b", "c"],
      hasMore: true,
      nextSortBucket: 1,
      nextSortBucketOffset: 2,
    });
  });

  it("skips empty bands", async () => {
    const result = await paginateCatQueueSortBuckets({
      limit: 2,
      fetchBand: createFetcher({
        untranslated: [[]],
        needs_review: [[]],
        reviewed: [["x", "y"]],
      }),
    });

    expect(result).toEqual({
      items: ["x", "y"],
      hasMore: false,
    });
  });

  it("resumes from a later band offset", async () => {
    const result = await paginateCatQueueSortBuckets({
      startBucketIndex: 1,
      startBucketOffset: 1,
      limit: 2,
      fetchBand: createFetcher({
        untranslated: [["a"]],
        needs_review: [["b", "c"]],
        reviewed: [["d", "e"]],
      }),
    });

    expect(result).toEqual({
      items: ["c", "d"],
      hasMore: true,
      nextSortBucket: 2,
      nextSortBucketOffset: 1,
    });
  });

  it("advances to the next band at a bucket boundary", async () => {
    const result = await paginateCatQueueSortBuckets({
      limit: 1,
      fetchBand: createFetcher({
        untranslated: [["a"]],
        needs_review: [["b"]],
        reviewed: [["c"]],
      }),
    });

    expect(result).toEqual({
      items: ["a"],
      hasMore: true,
      nextSortBucket: 1,
      nextSortBucketOffset: 0,
    });
  });

  it("reports no more pages after the last band", async () => {
    const result = await paginateCatQueueSortBuckets({
      startBucketIndex: 2,
      startBucketOffset: 0,
      limit: 10,
      fetchBand: createFetcher({
        untranslated: [["a"]],
        needs_review: [["b"]],
        reviewed: [["c"]],
      }),
    });

    expect(result).toEqual({
      items: ["c"],
      hasMore: false,
    });
  });
});
