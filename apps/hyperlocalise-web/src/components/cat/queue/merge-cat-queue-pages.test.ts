import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatQueuePage } from "@/components/cat/project-file/project-file-cat-api";
import { mergeCatQueuePages } from "./merge-cat-queue-pages";

function queuePage(
  segments: ProjectFileCatQueuePage["segments"],
  pagination: NonNullable<ProjectFileCatQueuePage["pagination"]>,
): ProjectFileCatQueuePage {
  return {
    sourcePath: "home.json",
    filename: "home.json",
    provider: null,
    targetLocale: "fr",
    canEditTranslations: true,
    truncated: pagination.hasMore,
    segments,
    pagination,
  };
}

describe("mergeCatQueuePages", () => {
  it("concatenates segments across pages and preserves hasMore from the last page", () => {
    const merged = mergeCatQueuePages([
      queuePage(
        [
          {
            externalStringId: "1",
            key: "a",
            sourceText: "A",
            context: null,
            type: null,
            comments: [],
          },
        ],
        { offset: 0, limit: 1, returnedCount: 1, totalCount: 2, hasMore: true },
      ),
      queuePage(
        [
          {
            externalStringId: "2",
            key: "b",
            sourceText: "B",
            context: null,
            type: null,
            comments: [],
          },
        ],
        { offset: 1, limit: 1, returnedCount: 1, totalCount: 2, hasMore: false },
      ),
    ]);

    expect(merged?.segments).toHaveLength(2);
    expect(merged?.pagination).toMatchObject({
      offset: 0,
      returnedCount: 2,
      hasMore: false,
    });
  });
});
