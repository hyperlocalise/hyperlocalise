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
// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  contentEditorApiTestContext,
  createCatComment,
  createCatFileResponse,
  createCatProviderMeta,
  createCatSegment,
  createCatTranslation,
  errorResponse,
  jsonResponse,
} from "@/components/content-editor/shared/content-editor-api.fixture";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

const {
  contentEditorTranslationsPostMock,
  contentEditorCommentsPostMock,
  contentEditorCommentResolvePatchMock,
  contentEditorStringsHiddenPostMock,
  contentEditorStringsLockedPostMock,
  invalidateSegmentTargetMock,
  syncSegmentTargetAfterSaveMock,
  invalidateSegmentCommentsMock,
} = vi.hoisted(() => ({
  contentEditorTranslationsPostMock: vi.fn(),
  contentEditorCommentsPostMock: vi.fn(),
  contentEditorCommentResolvePatchMock: vi.fn(),
  contentEditorStringsHiddenPostMock: vi.fn(),
  contentEditorStringsLockedPostMock: vi.fn(),
  invalidateSegmentTargetMock: vi.fn(),
  syncSegmentTargetAfterSaveMock: vi.fn(),
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
                      $post: (...args: unknown[]) => contentEditorTranslationsPostMock(...args),
                    },
                    strings: {
                      hidden: {
                        $post: (...args: unknown[]) => contentEditorStringsHiddenPostMock(...args),
                      },
                      locked: {
                        $post: (...args: unknown[]) => contentEditorStringsLockedPostMock(...args),
                      },
                    },
                    comments: {
                      $post: (...args: unknown[]) => contentEditorCommentsPostMock(...args),
                      ":commentId": {
                        resolve: {
                          $patch: (...args: unknown[]) =>
                            contentEditorCommentResolvePatchMock(...args),
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

vi.mock("./use-content-editor-segment-target", () => ({
  useInvalidateCatSegmentTarget: () => invalidateSegmentTargetMock,
  useSyncCatSegmentTargetAfterSave: () => syncSegmentTargetAfterSaveMock,
}));

vi.mock("./use-content-editor-segment-comments", () => ({
  useInvalidateCatSegmentComments: () => invalidateSegmentCommentsMock,
}));

import { useContentEditorMutations } from "./use-content-editor-mutations";

const invalidateQueue = vi.fn().mockResolvedValue(undefined);
const onTranslationSaved = vi.fn();

syncSegmentTargetAfterSaveMock.mockResolvedValue(undefined);

function renderCatMutations(contentEditorFile = createCatFileResponse().contentEditorFile) {
  return renderHook(
    () =>
      useContentEditorMutations({
        ...contentEditorApiTestContext,
        contentEditorFile,
        invalidateQueue,
        onTranslationSaved,
      }),
    { wrapper: ContentEditorTestProviders },
  );
}

afterEach(() => {
  vi.clearAllMocks();
  syncSegmentTargetAfterSaveMock.mockResolvedValue(undefined);
});

describe("useContentEditorMutations", () => {
  it("saves translations and invalidates the queue on success", async () => {
    const translation = createCatTranslation({ isApproved: true });
    contentEditorTranslationsPostMock.mockResolvedValue(jsonResponse({ translation }));

    const { result } = renderCatMutations();

    await act(async () => {
      const saved = await result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
        approve: true,
      });
      expect(saved).toEqual(translation);
    });

    expect(contentEditorTranslationsPostMock).toHaveBeenCalledWith(
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
    expect(syncSegmentTargetAfterSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalStringId: "segment-1",
        targetLocale: "fr",
      }),
      translation,
    );
  });

  it("surfaces API errors when saving translations fails", async () => {
    contentEditorTranslationsPostMock.mockResolvedValue(
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

  it("still saves hidden segments that are not locked", async () => {
    const translation = createCatTranslation({ isApproved: false });
    contentEditorTranslationsPostMock.mockResolvedValue(jsonResponse({ translation }));

    const { result } = renderCatMutations({
      ...createCatFileResponse().contentEditorFile,
      segments: [createCatSegment({ isHidden: true })],
    });

    await act(async () => {
      await result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
      });
    });

    expect(contentEditorTranslationsPostMock).toHaveBeenCalled();
    expect(onTranslationSaved).toHaveBeenCalledWith("segment-1", "Bonjour", false);
  });

  it("blocks saving translations for locked segments", async () => {
    const { result } = renderCatMutations({
      ...createCatFileResponse().contentEditorFile,
      segments: [createCatSegment({ isLocked: true })],
    });

    await expect(
      result.current.saveTranslation({
        externalStringId: "segment-1",
        text: "Bonjour",
      }),
    ).rejects.toThrow("Locked strings can't be edited from the Content Editor.");
    expect(contentEditorTranslationsPostMock).not.toHaveBeenCalled();
    expect(onTranslationSaved).not.toHaveBeenCalled();
  });

  it("throws when saving with a provider record missing an external resource id", async () => {
    const { result } = renderCatMutations({
      ...createCatFileResponse().contentEditorFile,
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
    expect(contentEditorTranslationsPostMock).not.toHaveBeenCalled();
  });

  it("posts comments and invalidates detail and comment queries", async () => {
    const comment = createCatComment({ type: "issue", status: "unresolved" });
    contentEditorCommentsPostMock.mockResolvedValue(jsonResponse({ comment }));

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

    expect(contentEditorCommentsPostMock).toHaveBeenCalledWith(
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
    contentEditorCommentsPostMock.mockResolvedValue(
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
    contentEditorCommentResolvePatchMock.mockResolvedValue(jsonResponse({ comment }));

    const { result } = renderCatMutations();

    await act(async () => {
      const resolved = await result.current.resolveComment({
        externalStringId: "segment-1",
        externalCommentId: "comment-1",
      });
      expect(resolved).toEqual(comment);
    });

    expect(contentEditorCommentResolvePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        param: expect.objectContaining({ commentId: "comment-1" }),
        json: expect.objectContaining({ externalResourceId: "crowdin-file" }),
      }),
    );
    expect(invalidateSegmentTargetMock).toHaveBeenCalled();
    expect(invalidateSegmentCommentsMock).toHaveBeenCalled();
  });

  it("hides strings and invalidates the queue on success", async () => {
    contentEditorStringsHiddenPostMock.mockResolvedValue(
      jsonResponse({ updatedCount: 2, isHidden: true }),
    );

    const { result } = renderCatMutations();

    await act(async () => {
      const saved = await result.current.setStringsHidden({
        externalStringIds: ["segment-1", "segment-2"],
        isHidden: true,
      });
      expect(saved).toEqual({ updatedCount: 2, isHidden: true });
    });

    expect(contentEditorStringsHiddenPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          sourcePath: contentEditorApiTestContext.sourcePath,
          externalStringIds: ["segment-1", "segment-2"],
          isHidden: true,
        }),
      }),
    );
    expect(invalidateQueue).toHaveBeenCalled();
  });

  it("locks strings and invalidates the queue on success", async () => {
    contentEditorStringsLockedPostMock.mockResolvedValue(
      jsonResponse({ contentEditorSegmentLock: { updatedCount: 2, isLocked: true } }),
    );

    const { result } = renderCatMutations();

    await act(async () => {
      const saved = await result.current.setStringsLocked({
        externalStringIds: ["segment-1", "segment-2"],
        isLocked: true,
      });
      expect(saved).toEqual({ updatedCount: 2, isLocked: true });
    });

    expect(contentEditorStringsLockedPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          sourcePath: contentEditorApiTestContext.sourcePath,
          targetLocale: contentEditorApiTestContext.targetLocale,
          externalStringIds: ["segment-1", "segment-2"],
          isLocked: true,
        }),
      }),
    );
    expect(invalidateQueue).toHaveBeenCalled();
  });

  it("surfaces API errors when hiding strings fails", async () => {
    contentEditorStringsHiddenPostMock.mockResolvedValue(
      errorResponse(
        "crowdin_hidden_strings_forbidden",
        "Crowdin did not allow updating hidden strings.",
        400,
      ),
    );

    const { result } = renderCatMutations();

    await expect(
      result.current.setStringsHidden({
        externalStringIds: ["segment-1"],
        isHidden: true,
      }),
    ).rejects.toThrow("Crowdin did not allow updating hidden strings.");
    expect(invalidateQueue).not.toHaveBeenCalled();
  });

  it("omits externalResourceId for native projects without a provider", async () => {
    const translation = createCatTranslation();
    contentEditorTranslationsPostMock.mockResolvedValue(jsonResponse({ translation }));

    const nativeFile = {
      ...createCatFileResponse().contentEditorFile,
      provider: null,
    };

    const { result } = renderHook(
      () =>
        useContentEditorMutations({
          ...contentEditorApiTestContext,
          contentEditorFile: nativeFile,
          invalidateQueue,
        }),
      { wrapper: ContentEditorTestProviders },
    );

    await act(async () => {
      await result.current.saveTranslation({
        externalStringId: "native-key-1",
        text: "Bonjour",
      });
    });

    expect(contentEditorTranslationsPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringId: "native-key-1",
          text: "Bonjour",
        }),
      }),
    );
    const lastCall = contentEditorTranslationsPostMock.mock.calls.at(-1)?.[0] as {
      json: { externalResourceId?: string };
    };
    expect(lastCall.json.externalResourceId).toBeUndefined();
  });

  it("tracks pending state while mutations are in flight", async () => {
    let resolveSave: (value: Response) => void = () => undefined;
    contentEditorTranslationsPostMock.mockImplementation(
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

  it("hides native source strings and invalidates the queue", async () => {
    contentEditorStringsHiddenPostMock.mockResolvedValue(
      jsonResponse({ updatedCount: 2, isHidden: true }),
    );

    const nativeFile = {
      ...createCatFileResponse().contentEditorFile,
      provider: null,
    };
    const { result } = renderCatMutations(nativeFile);

    await act(async () => {
      const response = await result.current.setStringsHidden({
        externalStringIds: ["segment-1", "segment-2"],
        isHidden: true,
      });
      expect(response).toEqual({ updatedCount: 2, isHidden: true });
    });

    expect(contentEditorStringsHiddenPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          sourcePath: contentEditorApiTestContext.sourcePath,
          externalStringIds: ["segment-1", "segment-2"],
          isHidden: true,
        }),
      }),
    );
    expect(invalidateQueue).toHaveBeenCalled();
  });

  it("chunks hidden-string updates to the native batch limit", async () => {
    contentEditorStringsHiddenPostMock.mockImplementation(() =>
      jsonResponse({ updatedCount: 200, isHidden: true }),
    );

    const nativeFile = {
      ...createCatFileResponse().contentEditorFile,
      provider: null,
    };
    const { result } = renderCatMutations(nativeFile);
    const externalStringIds = Array.from({ length: 201 }, (_, index) => `segment-${index + 1}`);

    await act(async () => {
      await result.current.setStringsHidden({
        externalStringIds,
        isHidden: true,
      });
    });

    expect(contentEditorStringsHiddenPostMock).toHaveBeenCalledTimes(2);
    expect(contentEditorStringsHiddenPostMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringIds: externalStringIds.slice(0, 200),
          isHidden: true,
        }),
      }),
    );
    expect(contentEditorStringsHiddenPostMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        json: expect.objectContaining({
          externalStringIds: ["segment-201"],
          isHidden: true,
        }),
      }),
    );
  });
});
