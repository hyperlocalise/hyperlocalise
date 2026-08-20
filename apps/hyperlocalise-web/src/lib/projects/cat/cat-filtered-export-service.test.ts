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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import type {
  ProjectFileCatQuery,
  ProjectFileCatQueueFile,
  ProjectFileCatSegment,
} from "@/api/routes/project/project.schema";

const { getProjectTranslationsByKeyIdsMock, getTmsProviderLiveCatSegmentTargetMock } = vi.hoisted(
  () => ({
    getProjectTranslationsByKeyIdsMock: vi.fn(),
    getTmsProviderLiveCatSegmentTargetMock: vi.fn(),
  }),
);

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  getProjectTranslationsByKeyIds: (...args: unknown[]) =>
    getProjectTranslationsByKeyIdsMock(...args),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  getTmsProviderLiveCatSegmentTarget: (...args: unknown[]) =>
    getTmsProviderLiveCatSegmentTargetMock(...args),
}));

vi.mock("./cat-filtered-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cat-filtered-export")>();
  return {
    ...actual,
    // Keep pagination/truncation tests small without fabricating 5k segments.
    maxCatFilteredExportSegments: 3,
  };
});

import {
  buildCatFilteredExportPayload,
  collectCatFilteredExportRows,
  type CatQueueLoader,
} from "./cat-filtered-export-service";

const auth = {
  user: { localUserId: "user_1" },
  organization: { localOrganizationId: "org_1" },
} as ApiAuthContext;

const baseQuery: ProjectFileCatQuery = {
  sourcePath: "locales/en.json",
  targetLocale: "vi",
};

function segment(
  partial: Partial<ProjectFileCatSegment> &
    Pick<ProjectFileCatSegment, "externalStringId" | "key" | "sourceText">,
): ProjectFileCatSegment {
  return {
    context: null,
    type: null,
    ...partial,
  };
}

function queuePage(input: {
  segments: ProjectFileCatSegment[];
  hasMore: boolean;
  offset?: number;
  returnedCount?: number;
  nextPhraseScanPage?: number;
  nextPhraseScanSkip?: number;
  nextSortBucket?: number;
  nextSortBucketOffset?: number;
}): ProjectFileCatQueueFile {
  const returnedCount = input.returnedCount ?? input.segments.length;
  return {
    sourcePath: baseQuery.sourcePath,
    filename: "en.json",
    provider: null,
    targetLocale: baseQuery.targetLocale,
    canEditTranslations: true,
    truncated: false,
    segments: input.segments,
    pagination: {
      offset: input.offset ?? 0,
      limit: 100,
      returnedCount,
      totalCount: returnedCount + (input.hasMore ? 1 : 0),
      hasMore: input.hasMore,
      nextPhraseScanPage: input.nextPhraseScanPage,
      nextPhraseScanSkip: input.nextPhraseScanSkip,
      nextSortBucket: input.nextSortBucket,
      nextSortBucketOffset: input.nextSortBucketOffset,
    },
  };
}

describe("collectCatFilteredExportRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectTranslationsByKeyIdsMock.mockResolvedValue([]);
    getTmsProviderLiveCatSegmentTargetMock.mockResolvedValue(null);
  });

  it("pages native queues, advances phrase-scan cursors, and fills missing targets as empty", async () => {
    const loadCatQueue = vi
      .fn<CatQueueLoader>()
      .mockResolvedValueOnce({
        kind: "ok",
        catQueue: queuePage({
          segments: [
            segment({ externalStringId: "k1", key: "hello", sourceText: "Hello" }),
            segment({ externalStringId: "k2", key: "bye", sourceText: "Bye" }),
          ],
          hasMore: true,
          offset: 0,
          nextPhraseScanPage: 2,
          nextPhraseScanSkip: 4,
        }),
      })
      .mockResolvedValueOnce({
        kind: "ok",
        catQueue: queuePage({
          segments: [segment({ externalStringId: "k3", key: "thanks", sourceText: "Thanks" })],
          hasMore: false,
          offset: 2,
        }),
      });

    getProjectTranslationsByKeyIdsMock
      .mockResolvedValueOnce([{ translationKeyId: "k1", text: "Xin chào" }])
      .mockResolvedValueOnce([{ translationKeyId: "k3", text: null }]);

    const result = await collectCatFilteredExportRows({
      auth,
      projectId: "project_1",
      query: { ...baseQuery, phraseScanPage: 1, phraseScanSkip: 0 },
      sourceLocale: "en",
      loadCatQueue,
    });

    expect(result).toEqual({
      kind: "ok",
      truncated: false,
      rows: [
        {
          key: "hello",
          sourceText: "Hello",
          targetText: "Xin chào",
          sourceLocale: "en",
          targetLocale: "vi",
          sourcePath: "locales/en.json",
        },
        {
          key: "bye",
          sourceText: "Bye",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "vi",
          sourcePath: "locales/en.json",
        },
        {
          key: "thanks",
          sourceText: "Thanks",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "vi",
          sourcePath: "locales/en.json",
        },
      ],
    });

    expect(loadCatQueue).toHaveBeenCalledTimes(2);
    expect(loadCatQueue.mock.calls[0]?.[2]).toMatchObject({
      offset: 0,
      limit: 3,
      phraseScanPage: 1,
      phraseScanSkip: 0,
    });
    expect(loadCatQueue.mock.calls[1]?.[2]).toMatchObject({
      offset: 2,
      limit: 1,
      phraseScanPage: 2,
      phraseScanSkip: 4,
    });
    expect(getTmsProviderLiveCatSegmentTargetMock).not.toHaveBeenCalled();
  });

  it("forwards Crowdin sort-bucket cursors between export pages", async () => {
    const loadCatQueue = vi
      .fn<CatQueueLoader>()
      .mockResolvedValueOnce({
        kind: "ok",
        catQueue: queuePage({
          segments: [segment({ externalStringId: "k1", key: "hello", sourceText: "Hello" })],
          hasMore: true,
          offset: 0,
          nextSortBucket: 0,
          nextSortBucketOffset: 10,
        }),
      })
      .mockResolvedValueOnce({
        kind: "ok",
        catQueue: queuePage({
          segments: [segment({ externalStringId: "k2", key: "bye", sourceText: "Bye" })],
          hasMore: false,
          offset: 1,
        }),
      });

    const result = await collectCatFilteredExportRows({
      auth,
      projectId: "project_1",
      query: { ...baseQuery, queueSort: "untranslated_first" },
      sourceLocale: "en",
      loadCatQueue,
    });

    expect(result.kind).toBe("ok");
    expect(loadCatQueue).toHaveBeenCalledTimes(2);
    expect(loadCatQueue.mock.calls[0]?.[2]).toMatchObject({
      offset: 0,
      queueSort: "untranslated_first",
    });
    expect(loadCatQueue.mock.calls[0]?.[2]?.sortBucket).toBeUndefined();
    expect(loadCatQueue.mock.calls[0]?.[2]?.sortBucketOffset).toBeUndefined();
    expect(loadCatQueue.mock.calls[1]?.[2]).toMatchObject({
      offset: 1,
      queueSort: "untranslated_first",
      sortBucket: 0,
      sortBucketOffset: 10,
    });
  });

  it("marks truncated when the export cap is hit while more pages remain", async () => {
    const loadCatQueue = vi.fn<CatQueueLoader>().mockResolvedValue({
      kind: "ok",
      catQueue: queuePage({
        segments: [
          segment({ externalStringId: "k1", key: "a", sourceText: "A" }),
          segment({ externalStringId: "k2", key: "b", sourceText: "B" }),
          segment({ externalStringId: "k3", key: "c", sourceText: "C" }),
        ],
        hasMore: true,
        offset: 0,
      }),
    });

    getProjectTranslationsByKeyIdsMock.mockResolvedValue([
      { translationKeyId: "k1", text: "A'" },
      { translationKeyId: "k2", text: "B'" },
      { translationKeyId: "k3", text: "C'" },
    ]);

    const result = await collectCatFilteredExportRows({
      auth,
      projectId: "project_1",
      query: baseQuery,
      sourceLocale: "en",
      loadCatQueue,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(loadCatQueue).toHaveBeenCalledTimes(1);
  });

  it("returns empty when the filtered queue has no segments", async () => {
    const loadCatQueue = vi.fn<CatQueueLoader>().mockResolvedValue({
      kind: "ok",
      catQueue: queuePage({ segments: [], hasMore: false }),
    });

    await expect(
      collectCatFilteredExportRows({
        auth,
        projectId: "project_1",
        query: baseQuery,
        sourceLocale: "en",
        loadCatQueue,
      }),
    ).resolves.toEqual({ kind: "empty" });
  });

  it("propagates loader failures without fetching targets", async () => {
    const loadCatQueue = vi.fn<CatQueueLoader>().mockResolvedValue({
      kind: "feature_unavailable",
    });

    await expect(
      collectCatFilteredExportRows({
        auth,
        projectId: "project_1",
        query: baseQuery,
        sourceLocale: "en",
        loadCatQueue,
      }),
    ).resolves.toEqual({ kind: "feature_unavailable" });
    expect(getProjectTranslationsByKeyIdsMock).not.toHaveBeenCalled();
  });

  it("loads provider targets concurrently and treats not_found as empty text", async () => {
    const loadCatQueue = vi.fn<CatQueueLoader>().mockResolvedValue({
      kind: "ok",
      catQueue: queuePage({
        segments: [
          segment({
            externalStringId: "p1",
            key: "title",
            sourceText: "Title",
            sourcePath: "a.json",
            externalResourceId: "file_a",
            resourceType: "file",
          }),
          segment({
            externalStringId: "p2",
            key: "body",
            sourceText: "Body",
            sourcePath: "b.json",
          }),
        ],
        hasMore: false,
      }),
    });

    getTmsProviderLiveCatSegmentTargetMock
      .mockResolvedValueOnce({ text: "Tiêu đề" })
      .mockResolvedValueOnce("not_found");

    const result = await collectCatFilteredExportRows({
      auth,
      projectId: "project_1",
      query: { ...baseQuery, sourcePath: "*" },
      sourceLocale: "en",
      externalProjectId: "crowdin_42",
      loadCatQueue,
    });

    expect(result).toEqual({
      kind: "ok",
      truncated: false,
      rows: [
        {
          key: "title",
          sourceText: "Title",
          targetText: "Tiêu đề",
          sourceLocale: "en",
          targetLocale: "vi",
          sourcePath: "a.json",
        },
        {
          key: "body",
          sourceText: "Body",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "vi",
          sourcePath: "b.json",
        },
      ],
    });

    expect(getProjectTranslationsByKeyIdsMock).not.toHaveBeenCalled();
    expect(getTmsProviderLiveCatSegmentTargetMock).toHaveBeenCalledWith(
      "org_1",
      "crowdin_42",
      "a.json",
      "vi",
      "p1",
      {
        actorUserId: "user_1",
        externalResourceId: "file_a",
        resourceType: "file",
      },
    );
    expect(getTmsProviderLiveCatSegmentTargetMock).toHaveBeenCalledWith(
      "org_1",
      "crowdin_42",
      "b.json",
      "vi",
      "p2",
      {
        actorUserId: "user_1",
        externalResourceId: undefined,
        resourceType: undefined,
      },
    );
  });
});

describe("buildCatFilteredExportPayload", () => {
  it("attaches a download filename derived from source path and locale", () => {
    const payload = buildCatFilteredExportPayload({
      format: "csv",
      sourcePath: "*",
      targetLocale: "vi",
      rows: [
        {
          key: "hello",
          sourceText: "Hello",
          targetText: "Xin chào",
          sourceLocale: "en",
          targetLocale: "vi",
        },
      ],
    });

    expect(payload.filename).toBe("all-files-vi.csv");
    expect(payload.extension).toBe("csv");
    expect(payload.contentType).toContain("text/csv");
    expect(payload.body).toContain("hello");
  });
});
