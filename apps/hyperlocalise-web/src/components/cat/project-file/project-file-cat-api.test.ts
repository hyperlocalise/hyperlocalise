import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  catApiTestContext,
  createCatComment,
  createCatQueueResponse,
  createCatSegment,
  errorResponse,
  jsonResponse,
} from "@/components/cat/shared/cat-api.fixture";

const { catQueueGetMock, catSegmentDetailGetMock, catSegmentCommentsGetMock } = vi.hoisted(() => ({
  catQueueGetMock: vi.fn(),
  catSegmentDetailGetMock: vi.fn(),
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
                        $get: (...args: unknown[]) => catSegmentDetailGetMock(...args),
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
  fetchProjectFileCatQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
} from "./project-file-cat-api";
import { fetchProjectFileCatSegmentComments } from "./use-cat-segment-comments";
import { fetchProjectFileCatSegmentDetail } from "./use-cat-segment-detail";

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchProjectFileCatQueuePage", () => {
  it("returns queue data on success", async () => {
    const queue = createCatQueueResponse().catQueue;
    catQueueGetMock.mockResolvedValue(jsonResponse({ catQueue: queue }));

    const result = await fetchProjectFileCatQueuePage({
      ...catApiTestContext,
      repositoryFullName: null,
      search: "",
      queueFilter: "all",
      limit: 50,
      offset: 0,
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

  it("forwards search, queue filter, repository, and phrase scan params", async () => {
    catQueueGetMock.mockResolvedValue(jsonResponse(createCatQueueResponse()));

    await fetchProjectFileCatQueuePage({
      ...catApiTestContext,
      search: "hero",
      queueFilter: "needs_review",
      limit: 25,
      offset: 50,
      phraseScanPage: 2,
      phraseScanSkip: 10,
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
          repositoryFullName: catApiTestContext.repositoryFullName,
          phraseScanPage: 2,
          phraseScanSkip: 10,
        },
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
        repositoryFullName: null,
        search: "",
        queueFilter: "all",
        limit: 50,
        offset: 0,
      }),
    ).rejects.toThrow("CAT queue is unavailable.");
  });
});

describe("fetchProjectFileCatSegmentDetail", () => {
  it("returns segment detail on success", async () => {
    const segment = createCatSegment({ externalStringId: "segment-42" });
    catSegmentDetailGetMock.mockResolvedValue(jsonResponse({ segment }));

    const result = await fetchProjectFileCatSegmentDetail({
      ...catApiTestContext,
      externalStringId: "segment-42",
      repositoryFullName: null,
    });

    expect(result).toEqual(segment);
    expect(catSegmentDetailGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: {
          organizationSlug: catApiTestContext.organizationSlug,
          projectId: catApiTestContext.projectId,
          externalStringId: "segment-42",
        },
        query: {
          sourcePath: catApiTestContext.sourcePath,
          targetLocale: catApiTestContext.targetLocale,
        },
      }),
    );
  });

  it("throws when segment detail cannot be loaded", async () => {
    catSegmentDetailGetMock.mockResolvedValue(
      errorResponse("segment_not_found", "Segment was not found.", 404),
    );

    await expect(
      fetchProjectFileCatSegmentDetail({
        ...catApiTestContext,
        externalStringId: "missing",
        repositoryFullName: null,
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
      externalStringId: "segment-1",
    });

    expect(result).toEqual(comments);
  });

  it("throws when comments cannot be loaded", async () => {
    catSegmentCommentsGetMock.mockResolvedValue(
      errorResponse("comments_unavailable", "Failed to load comments.", 500),
    );

    await expect(
      fetchProjectFileCatSegmentComments({
        ...catApiTestContext,
        externalStringId: "segment-1",
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
        repositoryFullName: "acme/web",
        search: "hero",
        queueFilter: "needs_review",
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
      "acme/web",
      "hero",
      "needs_review",
      50,
      50,
    ]);
  });

  it("uses distinct keys for adjacent pages so prefetch can warm the next page", () => {
    const base = {
      organizationSlug: "acme",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      repositoryFullName: null,
      search: "",
      queueFilter: "all" as const,
      limit: 50,
    };

    const page0 = projectFileCatQueryKey({ ...base, offset: 0 });
    const page1 = projectFileCatQueryKey({ ...base, offset: 50 });

    expect(page0).not.toEqual(page1);
    expect(page1.at(-1)).toBe(50);
  });
});

describe("projectFileCatBaseQueryKey", () => {
  it("omits offset so infinite-query pages share a base key", () => {
    const key = projectFileCatBaseQueryKey({
      ...catApiTestContext,
      repositoryFullName: null,
      search: "",
      queueFilter: "all",
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
      null,
      "",
      "all",
      50,
    ]);
    expect(key).not.toContain(0);
  });
});
