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
  catApiTestContext,
  createCatComment,
  createCatQueueResponse,
  errorResponse,
  jsonResponse,
} from "@/components/cat/shared/cat-api.fixture";
import { getIntlShape } from "@/lib/app-i18n/intl";

const testIntl = getIntlShape("en");

const { catQueueGetMock, catSegmentTargetGetMock, catSegmentCommentsGetMock } = vi.hoisted(() => ({
  catQueueGetMock: vi.fn(),
  catSegmentTargetGetMock: vi.fn(),
  catSegmentCommentsGetMock: vi.fn(),
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
                      $get: (...args: unknown[]) => catQueueGetMock(...args),
                    },
                    segments: {
                      ":externalStringId": {
                        target: {
                          $get: (...args: unknown[]) => catSegmentTargetGetMock(...args),
                        },
                        comments: {
                          $get: (...args: unknown[]) => catSegmentCommentsGetMock(...args),
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
  fetchProjectFileCatQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
} from "./project-file-cat-api";
import { fetchProjectFileCatSegmentComments } from "./use-cat-segment-comments";
import { fetchProjectFileCatSegmentTarget } from "./use-cat-segment-target";

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchProjectFileCatQueuePage", () => {
  it("returns queue data on success", async () => {
    const queue = createCatQueueResponse().catQueue;
    catQueueGetMock.mockResolvedValue(jsonResponse({ catQueue: queue }));

    const result = await fetchProjectFileCatQueuePage({
      ...catApiTestContext,
      search: "",
      queueFilter: "all",
      queueSort: "file_order",
      limit: 50,
      offset: 0,
      intl: testIntl,
    });

    expect(result).toEqual(queue);
    expect(catQueueGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: {
          organizationSlug: catApiTestContext.organizationSlug,
          projectId: catApiTestContext.projectId,
        },
        query: {
          sourcePath: catApiTestContext.sourcePath,
          targetLocale: catApiTestContext.targetLocale,
          offset: 0,
          limit: 50,
        },
      }),
    );
  });

  it("forwards search, queue filter, and phrase scan params without repository context", async () => {
    catQueueGetMock.mockResolvedValue(jsonResponse(createCatQueueResponse()));

    await fetchProjectFileCatQueuePage({
      ...catApiTestContext,
      search: "hero",
      queueFilter: "needs_review",
      queueSort: "file_order",
      limit: 25,
      offset: 50,
      phraseScanPage: 2,
      phraseScanSkip: 10,
      intl: testIntl,
    });

    expect(catQueueGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          sourcePath: catApiTestContext.sourcePath,
          targetLocale: catApiTestContext.targetLocale,
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
    catQueueGetMock.mockResolvedValue(jsonResponse(createCatQueueResponse()));

    await fetchProjectFileCatQueuePage({
      ...catApiTestContext,
      search: "",
      queueFilter: "has_issues",
      queueSort: "untranslated_first",
      limit: 50,
      offset: 50,
      sortBucket: 1,
      sortBucketOffset: 10,
      intl: testIntl,
    });

    expect(catQueueGetMock).toHaveBeenCalledWith(
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
    catQueueGetMock.mockResolvedValue(
      errorResponse("provider_cat_unavailable", "CAT queue is unavailable.", 503),
    );

    await expect(
      fetchProjectFileCatQueuePage({
        ...catApiTestContext,
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

describe("fetchProjectFileCatSegmentTarget", () => {
  it("returns segment target on success", async () => {
    const target = {
      text: "Bonjour",
      externalTranslationId: "translation-42",
      isApproved: false,
    };
    catSegmentTargetGetMock.mockResolvedValue(jsonResponse({ target }));

    const result = await fetchProjectFileCatSegmentTarget({
      ...catApiTestContext,
      externalResourceId: "101",
      resourceType: "file",
      externalStringId: "segment-42",
      intl: testIntl,
    });

    expect(result).toEqual(target);
    expect(catSegmentTargetGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: {
          organizationSlug: catApiTestContext.organizationSlug,
          projectId: catApiTestContext.projectId,
          externalStringId: "segment-42",
        },
        query: {
          sourcePath: catApiTestContext.sourcePath,
          externalResourceId: "101",
          resourceType: "file",
          targetLocale: catApiTestContext.targetLocale,
        },
      }),
    );
  });

  it("throws when segment target cannot be loaded", async () => {
    catSegmentTargetGetMock.mockResolvedValue(
      errorResponse("segment_not_found", "Segment was not found.", 404),
    );

    await expect(
      fetchProjectFileCatSegmentTarget({
        ...catApiTestContext,
        externalStringId: "missing",
        intl: testIntl,
      }),
    ).rejects.toThrow("Segment was not found.");
  });
});

describe("fetchProjectFileCatSegmentComments", () => {
  it("returns segment comments on success", async () => {
    const comments = [createCatComment()];
    catSegmentCommentsGetMock.mockResolvedValue(jsonResponse({ comments }));

    const result = await fetchProjectFileCatSegmentComments({
      ...catApiTestContext,
      externalResourceId: "101",
      resourceType: "file",
      externalStringId: "segment-1",
      intl: testIntl,
    });

    expect(result).toEqual(comments);
    expect(catSegmentCommentsGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          sourcePath: catApiTestContext.sourcePath,
          externalResourceId: "101",
          resourceType: "file",
          targetLocale: catApiTestContext.targetLocale,
        },
      }),
    );
  });

  it("throws when comments cannot be loaded", async () => {
    catSegmentCommentsGetMock.mockResolvedValue(
      errorResponse("comments_unavailable", "Failed to load comments.", 500),
    );

    await expect(
      fetchProjectFileCatSegmentComments({
        ...catApiTestContext,
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
      "project-file-cat-queue",
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
      ...catApiTestContext,
      search: "",
      queueFilter: "all",
      queueSort: "file_order",
      limit: 50,
    });

    expect(key).toEqual([
      "project-file-cat-queue",
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
    ...catApiTestContext,
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
