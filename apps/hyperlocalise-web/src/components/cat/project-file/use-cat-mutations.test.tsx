// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  catApiTestContext,
  createCatComment,
  createCatFileResponse,
  createCatProviderMeta,
  createCatTranslation,
  errorResponse,
  jsonResponse,
} from "@/components/cat/shared/cat-api.fixture";
import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";

const {
  catTranslationsPostMock,
  catCommentsPostMock,
  catCommentResolvePatchMock,
  invalidateSegmentTargetMock,
  invalidateSegmentCommentsMock,
} = vi.hoisted(() => ({
  catTranslationsPostMock: vi.fn(),
  catCommentsPostMock: vi.fn(),
  catCommentResolvePatchMock: vi.fn(),
  invalidateSegmentTargetMock: vi.fn(),
  invalidateSegmentCommentsMock: vi.fn(),
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
                    translations: {
                      $post: (...args: unknown[]) => catTranslationsPostMock(...args),
                    },
                    comments: {
                      $post: (...args: unknown[]) => catCommentsPostMock(...args),
                      ":commentId": {
                        resolve: {
                          $patch: (...args: unknown[]) => catCommentResolvePatchMock(...args),
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

vi.mock("./use-cat-segment-target", () => ({
  useInvalidateCatSegmentTarget: () => invalidateSegmentTargetMock,
}));

vi.mock("./use-cat-segment-comments", () => ({
  useInvalidateCatSegmentComments: () => invalidateSegmentCommentsMock,
}));

import { useCatMutations } from "./use-cat-mutations";

const invalidateQueue = vi.fn().mockResolvedValue(undefined);
const onTranslationSaved = vi.fn();

function renderCatMutations(catFile = createCatFileResponse().catFile) {
  return renderHook(
    () =>
      useCatMutations({
        ...catApiTestContext,
        catFile,
        invalidateQueue,
        onTranslationSaved,
      }),
    { wrapper: CatTestProviders },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCatMutations", () => {
  it("saves translations and invalidates the queue on success", async () => {
    const translation = createCatTranslation({ isApproved: true });
    catTranslationsPostMock.mockResolvedValue(jsonResponse({ translation }));

    const { result } = renderCatMutations();

    await act(async () => {
      const saved = await result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
        approve: true,
      });
      expect(saved).toEqual(translation);
    });

    expect(catTranslationsPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringId: "segment-1",
          externalResourceId: "crowdin-file",
          text: "Bonjour",
          approve: true,
        }),
      }),
    );
    expect(onTranslationSaved).toHaveBeenCalledWith("segment-1", "Bonjour", true);
    expect(invalidateQueue).toHaveBeenCalled();
  });

  it("surfaces API errors when saving translations fails", async () => {
    catTranslationsPostMock.mockResolvedValue(
      errorResponse("provider_write_failed", "Provider rejected the update.", 502),
    );

    const { result } = renderCatMutations();

    await expect(
      result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
      }),
    ).rejects.toThrow("Provider rejected the update.");
    expect(onTranslationSaved).not.toHaveBeenCalled();
    expect(invalidateQueue).not.toHaveBeenCalled();
  });

  it("throws when saving with a provider record missing an external resource id", async () => {
    const { result } = renderCatMutations({
      ...createCatFileResponse().catFile,
      provider: {
        ...createCatProviderMeta(),
        externalResourceId: "",
      },
    });

    await expect(
      result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
      }),
    ).rejects.toThrow("Cannot save translation because the provider file identifier is missing.");
    expect(catTranslationsPostMock).not.toHaveBeenCalled();
  });

  it("posts comments and invalidates detail and comment queries", async () => {
    const comment = createCatComment({ type: "issue", status: "unresolved" });
    catCommentsPostMock.mockResolvedValue(jsonResponse({ comment }));

    const { result } = renderCatMutations();

    await act(async () => {
      const posted = await result.current.postComment({
        externalStringId: "segment-1",
        text: "Wrong tone.",
        type: "issue",
        issueType: "translation_mistake",
      });
      expect(posted).toEqual(comment);
    });

    expect(catCommentsPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringId: "segment-1",
          externalResourceId: "crowdin-file",
          text: "Wrong tone.",
          type: "issue",
          issueType: "translation_mistake",
        }),
      }),
    );
    expect(invalidateQueue).toHaveBeenCalled();
    expect(invalidateSegmentTargetMock).toHaveBeenCalledWith(
      expect.objectContaining({ externalStringId: "segment-1" }),
    );
    expect(invalidateSegmentCommentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ externalStringId: "segment-1" }),
    );
  });

  it("surfaces API errors when posting comments fails", async () => {
    catCommentsPostMock.mockResolvedValue(
      errorResponse("comment_post_failed", "Failed to post comment.", 403),
    );

    const { result } = renderCatMutations();

    await expect(
      result.current.postComment({
        externalStringId: "segment-1",
        text: "Needs review.",
      }),
    ).rejects.toThrow("Failed to post comment.");
  });

  it("resolves comments and invalidates related queries", async () => {
    const comment = createCatComment({ status: "resolved" });
    catCommentResolvePatchMock.mockResolvedValue(jsonResponse({ comment }));

    const { result } = renderCatMutations();

    await act(async () => {
      const resolved = await result.current.resolveComment({
        externalStringId: "segment-1",
        externalCommentId: "comment-1",
      });
      expect(resolved).toEqual(comment);
    });

    expect(catCommentResolvePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: expect.objectContaining({ commentId: "comment-1" }),
        json: expect.objectContaining({ externalResourceId: "crowdin-file" }),
      }),
    );
    expect(invalidateSegmentTargetMock).toHaveBeenCalled();
    expect(invalidateSegmentCommentsMock).toHaveBeenCalled();
  });

  it("omits externalResourceId for native projects without a provider", async () => {
    const translation = createCatTranslation();
    catTranslationsPostMock.mockResolvedValue(jsonResponse({ translation }));

    const nativeFile = {
      ...createCatFileResponse().catFile,
      provider: null,
    };

    const { result } = renderHook(
      () =>
        useCatMutations({
          ...catApiTestContext,
          catFile: nativeFile,
          invalidateQueue,
        }),
      { wrapper: CatTestProviders },
    );

    await act(async () => {
      await result.current.saveTranslation({
        externalStringId: "native-key-1",
        text: "Bonjour",
      });
    });

    expect(catTranslationsPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringId: "native-key-1",
          text: "Bonjour",
        }),
      }),
    );
    const lastCall = catTranslationsPostMock.mock.calls.at(-1)?.[0] as {
      json: { externalResourceId?: string };
    };
    expect(lastCall.json.externalResourceId).toBeUndefined();
  });

  it("tracks pending state while mutations are in flight", async () => {
    let resolveSave: (value: Response) => void = () => undefined;
    catTranslationsPostMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result } = renderCatMutations();

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
      });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    await act(async () => {
      resolveSave(jsonResponse({ translation: createCatTranslation() }));
      await savePromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
