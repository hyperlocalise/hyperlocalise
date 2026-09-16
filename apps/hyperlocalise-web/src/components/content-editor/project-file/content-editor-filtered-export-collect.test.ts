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

import type {
  ProjectFileContentEditorQueueFile,
  ProjectFileContentEditorSegment,
} from "@/api/routes/project/project.schema";

const {
  fetchProjectFileContentEditorQueuePageMock,
  fetchProjectFileContentEditorSegmentTargetMock,
} = vi.hoisted(() => ({
  fetchProjectFileContentEditorQueuePageMock: vi.fn(),
  fetchProjectFileContentEditorSegmentTargetMock: vi.fn(),
}));

vi.mock("./project-file-content-editor-api", () => ({
  fetchProjectFileContentEditorQueuePage: (...args: unknown[]) =>
    fetchProjectFileContentEditorQueuePageMock(...args),
}));

vi.mock("./use-content-editor-segment-target", () => ({
  fetchProjectFileContentEditorSegmentTarget: (...args: unknown[]) =>
    fetchProjectFileContentEditorSegmentTargetMock(...args),
}));

vi.mock("@/lib/projects/content-editor/content-editor-filtered-export", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/projects/content-editor/content-editor-filtered-export")
    >();
  return {
    ...actual,
    maxCatFilteredExportSegments: 3,
  };
});

import { collectCatFilteredExportRows } from "./content-editor-filtered-export-collect";

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }) => descriptor.defaultMessage ?? "",
} as const;

const baseInput = {
  organizationSlug: "acme",
  projectId: "project_1",
  sourcePath: "locales/en.json",
  targetLocale: "vi",
  sourceLocale: "en",
  search: "",
  queueFilter: "all" as const,
  intl,
};

function segment(
  partial: Partial<ProjectFileContentEditorSegment> &
    Pick<ProjectFileContentEditorSegment, "externalStringId" | "key" | "sourceText">,
): ProjectFileContentEditorSegment {
  return {
    context: null,
    type: null,
    ...partial,
  };
}

function queuePage(input: {
  segments: ProjectFileContentEditorSegment[];
  hasMore: boolean;
  offset?: number;
  returnedCount?: number;
  nextPhraseScanPage?: number;
  nextPhraseScanSkip?: number;
  nextSortBucket?: number;
  nextSortBucketOffset?: number;
}): ProjectFileContentEditorQueueFile {
  const returnedCount = input.returnedCount ?? input.segments.length;
  return {
    sourcePath: baseInput.sourcePath,
    filename: "en.json",
    provider: null,
    targetLocale: baseInput.targetLocale,
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
    fetchProjectFileContentEditorSegmentTargetMock.mockResolvedValue(null);
  });

  it("pages queues, advances phrase-scan cursors, and fills missing targets as empty", async () => {
    fetchProjectFileContentEditorQueuePageMock
      .mockResolvedValueOnce(
        queuePage({
          segments: [
            segment({ externalStringId: "k1", key: "hello", sourceText: "Hello" }),
            segment({ externalStringId: "k2", key: "bye", sourceText: "Bye" }),
          ],
          hasMore: true,
          offset: 0,
          nextPhraseScanPage: 2,
          nextPhraseScanSkip: 4,
        }),
      )
      .mockResolvedValueOnce(
        queuePage({
          segments: [segment({ externalStringId: "k3", key: "thanks", sourceText: "Thanks" })],
          hasMore: false,
          offset: 2,
        }),
      );

    fetchProjectFileContentEditorSegmentTargetMock.mockImplementation(
      async (input: { externalStringId: string }) => {
        if (input.externalStringId === "k1") {
          return { text: "Xin chào" };
        }
        return null;
      },
    );

    const result = await collectCatFilteredExportRows({
      ...baseInput,
      queueSort: "file_order",
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

    expect(fetchProjectFileContentEditorQueuePageMock).toHaveBeenCalledTimes(2);
    expect(fetchProjectFileContentEditorQueuePageMock.mock.calls[0]?.[0]).toMatchObject({
      offset: 0,
      limit: 3,
      phraseScanPage: undefined,
      phraseScanSkip: undefined,
    });
    expect(fetchProjectFileContentEditorQueuePageMock.mock.calls[1]?.[0]).toMatchObject({
      offset: 2,
      limit: 1,
      phraseScanPage: 2,
      phraseScanSkip: 4,
    });
  });

  it("forwards Crowdin sort-bucket cursors between export pages", async () => {
    fetchProjectFileContentEditorQueuePageMock
      .mockResolvedValueOnce(
        queuePage({
          segments: [segment({ externalStringId: "k1", key: "hello", sourceText: "Hello" })],
          hasMore: true,
          offset: 0,
          nextSortBucket: 0,
          nextSortBucketOffset: 10,
        }),
      )
      .mockResolvedValueOnce(
        queuePage({
          segments: [segment({ externalStringId: "k2", key: "bye", sourceText: "Bye" })],
          hasMore: false,
          offset: 1,
        }),
      );

    const result = await collectCatFilteredExportRows({
      ...baseInput,
      queueSort: "untranslated_first",
    });

    expect(result.kind).toBe("ok");
    expect(fetchProjectFileContentEditorQueuePageMock).toHaveBeenCalledTimes(2);
    expect(fetchProjectFileContentEditorQueuePageMock.mock.calls[0]?.[0]).toMatchObject({
      offset: 0,
      queueSort: "untranslated_first",
    });
    expect(
      fetchProjectFileContentEditorQueuePageMock.mock.calls[0]?.[0]?.sortBucket,
    ).toBeUndefined();
    expect(fetchProjectFileContentEditorQueuePageMock.mock.calls[1]?.[0]).toMatchObject({
      offset: 1,
      queueSort: "untranslated_first",
      sortBucket: 0,
      sortBucketOffset: 10,
    });
  });

  it("marks truncated when the export cap is hit while more pages remain", async () => {
    fetchProjectFileContentEditorQueuePageMock.mockResolvedValue(
      queuePage({
        segments: [
          segment({ externalStringId: "k1", key: "a", sourceText: "A" }),
          segment({ externalStringId: "k2", key: "b", sourceText: "B" }),
          segment({ externalStringId: "k3", key: "c", sourceText: "C" }),
        ],
        hasMore: true,
        offset: 0,
      }),
    );

    fetchProjectFileContentEditorSegmentTargetMock.mockImplementation(
      async (input: { externalStringId: string }) => ({ text: `${input.externalStringId}'` }),
    );

    const result = await collectCatFilteredExportRows(baseInput);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(fetchProjectFileContentEditorQueuePageMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty when the filtered queue has no segments", async () => {
    fetchProjectFileContentEditorQueuePageMock.mockResolvedValue(
      queuePage({ segments: [], hasMore: false }),
    );

    await expect(collectCatFilteredExportRows(baseInput)).resolves.toEqual({ kind: "empty" });
  });

  it("continues through empty pages that provide a scan cursor", async () => {
    fetchProjectFileContentEditorQueuePageMock
      .mockResolvedValueOnce(
        queuePage({
          segments: [],
          hasMore: true,
          nextPhraseScanPage: 52,
          nextPhraseScanSkip: 0,
        }),
      )
      .mockResolvedValueOnce(
        queuePage({
          segments: [segment({ externalStringId: "k1", key: "home.title", sourceText: "Title" })],
          hasMore: false,
          offset: 0,
        }),
      );

    const result = await collectCatFilteredExportRows(baseInput);

    expect(result).toMatchObject({
      kind: "ok",
      truncated: false,
      rows: [
        {
          key: "home.title",
          sourceText: "Title",
          targetText: "",
        },
      ],
    });
    expect(fetchProjectFileContentEditorQueuePageMock).toHaveBeenCalledTimes(2);
    expect(fetchProjectFileContentEditorQueuePageMock.mock.calls[1]?.[0]).toMatchObject({
      phraseScanPage: 52,
      phraseScanSkip: 0,
    });
  });

  it("loads segment targets per row with segment-specific source paths", async () => {
    fetchProjectFileContentEditorQueuePageMock.mockResolvedValue(
      queuePage({
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
    );

    fetchProjectFileContentEditorSegmentTargetMock.mockImplementation(
      async (input: { externalStringId: string }) => {
        if (input.externalStringId === "p1") {
          return { text: "Tiêu đề" };
        }
        return null;
      },
    );

    const result = await collectCatFilteredExportRows({
      ...baseInput,
      sourcePath: "*",
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

    expect(fetchProjectFileContentEditorSegmentTargetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "a.json",
        externalStringId: "p1",
        externalResourceId: "file_a",
        resourceType: "file",
      }),
    );
    expect(fetchProjectFileContentEditorSegmentTargetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "b.json",
        externalStringId: "p2",
      }),
    );
  });
});
