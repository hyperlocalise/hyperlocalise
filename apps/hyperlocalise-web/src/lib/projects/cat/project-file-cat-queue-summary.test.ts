import { describe, expect, it, vi } from "vite-plus/test";

import type { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";

import { countCrowdinFileQueueSummary } from "./project-file-cat-queue-summary";

describe("countCrowdinFileQueueSummary", () => {
  it("stops counting when Crowdin returns an empty page with hasMore", async () => {
    const listSourceStringsPage = vi.fn().mockResolvedValue({
      strings: [],
      offset: 0,
      limit: 500,
      hasMore: true,
      totalCount: 1,
    });
    const client = { listSourceStringsPage } as unknown as CrowdinApiClient;

    const summary = await countCrowdinFileQueueSummary(client, 42, 101, "fr", {
      knownTotal: 12,
    });

    expect(summary).toEqual({
      total: 12,
      reviewed: 0,
      untranslated: 0,
      needsReview: 0,
      hasIssues: 0,
    });
    expect(listSourceStringsPage).toHaveBeenCalledTimes(4);
    expect(listSourceStringsPage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ offset: 0, limit: 500 }),
    );
  });
});
