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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  contentEditorApiTestContext,
  createCatComment,
  createCatQueueResponse,
  errorResponse,
  jsonResponse,
} from "@/components/content-editor/shared/content-editor-api.fixture";
import { getIntlShape } from "@/lib/app-i18n/intl";

const testIntl = getIntlShape("en");

const {
  contentEditorQueueGetMock,
  contentEditorSegmentTargetGetMock,
  contentEditorSegmentCommentsGetMock,
} = vi.hoisted(() => ({
  contentEditorQueueGetMock: vi.fn(),
  contentEditorSegmentTargetGetMock: vi.fn(),
  contentEditorSegmentCommentsGetMock: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              files: {
                detail: {
                  cat: {
                    queue: {
                      $get: (...args: unknown[]) => contentEditorQueueGetMock(...args),
                    },
                    segments: {
                      ":externalStringId": {
                        target: {
                          $get: (...args: unknown[]) => contentEditorSegmentTargetGetMock(...args),
                        },
                        comments: {
                          $get: (...args: unknown[]) =>
                            contentEditorSegmentCommentsGetMock(...args),
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}));

import {
  canReuseCatQueuePlaceholderData,
  fetchProjectFileContentEditorQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
} from "./project-file-content-editor-api";
import { fetchProjectFileContentEditorSegmentComments } from "./use-content-editor-segment-comments";
import { fetchProjectFileContentEditorSegmentTarget } from "./use-content-editor-segment-target";

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchProjectFileContentEditorQueuePage", () => {
  it("returns queue data on success", async () => {
    const queue = createCatQueueResponse().contentEditorQueue;
    contentEditorQueueGetMock.mockResolvedValue(jsonResponse({ contentEditorQueue: queue }));

    const result = await fetchProjectFileContentEditorQueuePage({
      ...contentEditorApiTestContext,
      search: "",
      queueFilter: "all",
      queueSort: "file_order",
      limit: 50,
      offset: 0,
      intl: testIntl,
    });

    expect(result).toEqual(queue);
    expect(contentEditorQueueGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: {
          organizationSlug: contentEditorApiTestContext.organizationSlug,
          projectId: contentEditorApiTestContext.projectId,
        },
        query: {
          sourcePath: contentEditorApiTestContext.sourcePath,
          targetLocale: contentEditorApiTestContext.targetLocale,
          offset: 0,
          limit: 50,
        },
      }),
    );
  });

  it("forwards search, queue filter, and phrase scan params without repository context", async () => {
    contentEditorQueueGetMock.mockResolvedValue(jsonResponse(createCatQueueResponse()));

    await fetchProjectFileContentEditorQueuePage({
      ...contentEditorApiTestContext,
      search: "hero",
      queueFilter: "needs_review",
      queueSort: "file_order",
      limit: 25,
      offset: 50,
      phraseScanPage: 2,
      phraseScanSkip: 10,
      intl: testIntl,
    });

    expect(contentEditorQueueGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          sourcePath: contentEditorApiTestContext.sourcePath,
          targetLocale: contentEditorApiTestContext.targetLocale,
          offset: 50,
          limit: 25,
          search: "hero",
          queueFilter: "needs_review",
          phraseScanPage: 2,
          phraseScanSkip: 10,
        },
      }),
    );
  });

  it("forwards untranslated-first sort and bucket cursors", async () => {
    contentEditorQueueGetMock.mockResolvedValue(jsonResponse(createCatQueueResponse()));

    await fetchProjectFileContentEditorQueuePage({
      ...contentEditorApiTestContext,
      search: "",
      queueFilter: "has_issues",
      queueSort: "untranslated_first",
      limit: 50,
      offset: 50,
      sortBucket: 1,
      sortBucketOffset: 10,
      intl: testIntl,
    });

    expect(contentEditorQueueGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          queueFilter: "has_issues",
          queueSort: "untranslated_first",
          sortBucket: 1,
          sortBucketOffset: 10,
        }),
      }),
    );
  });

  it("throws a readable error when the queue request fails", async () => {
    contentEditorQueueGetMock.mockResolvedValue(
      errorResponse("provider_cat_unavailable", "CAT queue is unavailable.", 503),
    );

    await expect(
      fetchProjectFileContentEditorQueuePage({
        ...contentEditorApiTestContext,
        search: "",
        queueFilter: "all",
        queueSort: "file_order",
        limit: 50,
        offset: 0,
        intl: testIntl,
      }),
    ).rejects.toThrow("CAT queue is unavailable.");
  });
});

describe("fetchProjectFileContentEditorSegmentTarget", () => {
  it("returns segment target on success", async () => {
    const target = {
      text: "Bonjour",
      externalTranslationId: "translation-42",
      isApproved: false,
    };
    contentEditorSegmentTargetGetMock.mockResolvedValue(jsonResponse({ target }));

    const result = await fetchProjectFileContentEditorSegmentTarget({
      ...contentEditorApiTestContext,
      externalResourceId: "101",
      resourceType: "file",
      externalStringId: "segment-42",
      intl: testIntl,
    });

    expect(result).toEqual(target);
    expect(contentEditorSegmentTargetGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: {
          organizationSlug: contentEditorApiTestContext.organizationSlug,
          projectId: contentEditorApiTestContext.projectId,
          externalStringId: "segment-42",
        },
        query: {
          sourcePath: contentEditorApiTestContext.sourcePath,
          externalResourceId: "101",
          resourceType: "file",
          targetLocale: contentEditorApiTestContext.targetLocale,
        },
      }),
    );
  });

  it("throws when segment target cannot be loaded", async () => {
    contentEditorSegmentTargetGetMock.mockResolvedValue(
      errorResponse("segment_not_found", "Segment was not found.", 404),
    );

    await expect(
      fetchProjectFileContentEditorSegmentTarget({
        ...contentEditorApiTestContext,
        externalStringId: "missing",
        intl: testIntl,
      }),
    ).rejects.toThrow("Segment was not found.");
  });
});

describe("fetchProjectFileContentEditorSegmentComments", () => {
  it("returns segment comments on success", async () => {
    const comments = [createCatComment()];
    contentEditorSegmentCommentsGetMock.mockResolvedValue(jsonResponse({ comments }));

    const result = await fetchProjectFileContentEditorSegmentComments({
      ...contentEditorApiTestContext,
      externalResourceId: "101",
      resourceType: "file",
      externalStringId: "segment-1",
      intl: testIntl,
    });

    expect(result).toEqual(comments);
    expect(contentEditorSegmentCommentsGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          sourcePath: contentEditorApiTestContext.sourcePath,
          externalResourceId: "101",
          resourceType: "file",
          targetLocale: contentEditorApiTestContext.targetLocale,
        },
      }),
    );
  });

  it("throws when comments cannot be loaded", async () => {
    contentEditorSegmentCommentsGetMock.mockResolvedValue(
      errorResponse("comments_unavailable", "Failed to load comments.", 500),
    );

    await expect(
      fetchProjectFileContentEditorSegmentComments({
        ...contentEditorApiTestContext,
        externalStringId: "segment-1",
        intl: testIntl,
      }),
    ).rejects.toThrow("Failed to load comments.");
  });
});

describe("projectFileCatQueryKey", () => {
  it("includes search, queue filter, limit, and offset for page-scoped cache keys", () => {
    expect(
      projectFileCatQueryKey({
        organizationSlug: "acme",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        targetLocale: "fr",
        search: "hero",
        queueFilter: "needs_review",
        queueSort: "file_order",
        limit: 50,
        offset: 50,
      }),
    ).toEqual([
      "project-file-content-editor-queue",
      "acme",
      "project_1",
      "locales/en.json",
      null,
      null,
      "fr",
      "hero",
      "needs_review",
      "file_order",
      50,
      50,
      null,
    ]);
  });

  it("uses distinct keys for adjacent pages so prefetch can warm the next page", () => {
    const base = {
      organizationSlug: "acme",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      search: "",
      queueFilter: "all" as const,
      queueSort: "file_order" as const,
      limit: 50,
    };

    const page0 = projectFileCatQueryKey({ ...base, offset: 0 });
    const page1 = projectFileCatQueryKey({ ...base, offset: 50 });

    expect(page0).not.toEqual(page1);
    expect(page1.at(-2)).toBe(50);
  });
});

describe("projectFileCatBaseQueryKey", () => {
  it("omits offset so infinite-query pages share a base key", () => {
    const key = projectFileCatBaseQueryKey({
      ...contentEditorApiTestContext,
      search: "",
      queueFilter: "all",
      queueSort: "file_order",
      limit: 50,
    });

    expect(key).toEqual([
      "project-file-content-editor-queue",
      "acme",
      "project_1",
      "locales/en.json",
      null,
      null,
      "fr",
      "",
      "all",
      "file_order",
      50,
      null,
    ]);
    expect(key).not.toContain(0);
  });
});

describe("canReuseCatQueuePlaceholderData", () => {
  const baseKeyInput = {
    ...contentEditorApiTestContext,
    search: "",
    queueFilter: "all" as const,
    queueSort: "file_order" as const,
    limit: 50,
  };

  it("reuses previous data when only search, filter, sort, or page size change", () => {
    const previousKey = projectFileCatBaseQueryKey(baseKeyInput);

    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, search: "hero" }),
      ),
    ).toBe(true);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, queueFilter: "needs_review" }),
      ),
    ).toBe(true);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, queueSort: "untranslated_first" }),
      ),
    ).toBe(true);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, limit: 25 }),
      ),
    ).toBe(true);
  });

  it("does not reuse previous data when the target locale or file identity changes", () => {
    const previousKey = projectFileCatBaseQueryKey(baseKeyInput);

    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, targetLocale: "de" }),
      ),
    ).toBe(false);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, sourcePath: "locales/other.json" }),
      ),
    ).toBe(false);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({
          ...baseKeyInput,
          sourcePaths: "locales/en.json,locales/de.json",
        }),
      ),
    ).toBe(false);
    expect(
      canReuseCatQueuePlaceholderData(
        previousKey,
        projectFileCatBaseQueryKey({ ...baseKeyInput, projectId: "project_2" }),
      ),
    ).toBe(false);
  });
});
