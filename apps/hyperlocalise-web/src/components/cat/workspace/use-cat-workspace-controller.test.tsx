// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState, mockValidateFormat } from "@/components/cat/shared/cat.fixture";
import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";
import type { CatSegmentConcordanceResult } from "@/components/cat/shared/dependencies";

import { createCatWorkspaceStore } from "./store/cat-workspace-store";
import { useCatWorkspaceController } from "./use-cat-workspace-controller";

function renderController(
  initialState = createCatWorkspaceState({
    selectedSegmentId: "seg-02",
    segments: [
      {
        id: "seg-01",
        index: 1,
        key: "first",
        sourceText: "First",
        targetText: "Premier",
        sourceLocale: "en-US",
        targetLocale: "vi",
        status: "reviewed",
      },
      {
        id: "seg-02",
        index: 2,
        key: "second",
        sourceText: "Second",
        targetText: "",
        sourceLocale: "en-US",
        targetLocale: "vi",
        status: "pending",
      },
      {
        id: "seg-03",
        index: 3,
        key: "third",
        sourceText: "Third",
        targetText: "Troisième",
        sourceLocale: "en-US",
        targetLocale: "vi",
        status: "pending",
      },
    ],
  }),
  overrides: Record<string, unknown> = {},
) {
  const store = createCatWorkspaceStore(initialState);

  return {
    store,
    ...renderHook(
      () =>
        useCatWorkspaceController({
          store,
          initialState,
          services: {
            validateFormat: mockValidateFormat,
            ...(overrides.services as object),
          },
          review: overrides.review as never,
          editing: overrides.editing as never,
          navigation: overrides.navigation as never,
          ...overrides,
        }),
      { wrapper: CatTestProviders },
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCatWorkspaceController", () => {
  it("runs format checks when the target text changes", async () => {
    const { result, store } = renderController();

    act(() => {
      result.current.dependencies.editing.onTargetChange("seg-02", "Deuxième");
    });

    await waitFor(() => expect(store.segmentFormatChecks["seg-02"]?.length).toBeGreaterThan(0));
    expect(store.segments.find((segment) => segment.id === "seg-02")?.targetText).toBe("Deuxième");
  });

  it("applies AI suggestions through the editing pipeline", () => {
    const initialState = createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segmentIntelligence: {
        "seg-02": {
          ...createCatWorkspaceState().intelligence,
          aiSuggestion: "Suggestion IA",
        },
      },
    });
    const { result, store } = renderController(initialState);

    act(() => {
      result.current.dependencies.editing.onUseAiSuggestion("seg-02");
    });

    expect(store.segments.find((segment) => segment.id === "seg-02")?.targetText).toBe(
      "Suggestion IA",
    );
  });

  it("auto-fills empty targets from high-confidence TM matches during concordance lookup", async () => {
    const concordance: CatSegmentConcordanceResult = {
      glossaryTerms: [],
      translationMemoryMatches: [
        {
          id: "tm-1",
          sourceText: "Second",
          targetText: "Deuxième",
          matchPercent: 100,
          contextLabel: "Settings",
        },
      ],
    };

    const { store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance: vi.fn().mockResolvedValue(concordance),
      },
    });

    await waitFor(() =>
      expect(store.segments.find((segment) => segment.id === "seg-02")?.targetText).toBe(
        "Deuxième",
      ),
    );
    expect(store.autoFilledSegmentIds.has("seg-02")).toBe(true);
  });

  it("records concordance lookup failures as format checks", async () => {
    const { store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance: vi.fn().mockRejectedValue(new Error("TM unavailable")),
      },
    });

    await waitFor(() =>
      expect(store.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "concordance-failed-seg-02",
            message: "TM unavailable",
          }),
        ]),
      ),
    );
  });

  it("records AI recommendation failures as format checks", async () => {
    const { result, store } = renderController(undefined, {
      services: {
        generateAiRecommendation: vi.fn().mockRejectedValue(new Error("Model overloaded")),
      },
    });

    await act(async () => {
      await result.current.dependencies.review.onReviewWithAi("seg-02");
    });

    expect(store.segmentFormatChecks["seg-02"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ai-recommendation-failed-seg-02",
          message: "Model overloaded",
        }),
      ]),
    );
  });

  it("advances to the next segment after a successful approve", async () => {
    const onApprove = vi.fn().mockResolvedValue("reviewed");
    const { result, store } = renderController(undefined, {
      review: { onApprove },
    });

    await act(async () => {
      await result.current.dependencies.review.onApprove("seg-02", "Deuxième");
    });

    expect(onApprove).toHaveBeenCalledWith("seg-02", "Deuxième");
    expect(store.selectedSegmentId).toBe("seg-03");
    expect(store.segments.find((segment) => segment.id === "seg-02")?.status).toBe("reviewed");
  });

  it("adds save failure checks when approve fails", async () => {
    const { result, store } = renderController(undefined, {
      services: {},
      review: {
        onApprove: vi.fn().mockRejectedValue(new Error("Provider rejected the update.")),
      },
    });

    await act(async () => {
      await result.current.dependencies.review.onApprove("seg-02", "Deuxième");
    });

    expect(store.segmentFormatChecks["seg-02"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "save-failed-seg-02",
          message: "Provider rejected the update.",
        }),
      ]),
    );
    expect(store.selectedSegmentId).toBe("seg-02");
  });

  it("stores comment post errors without losing the current segment", async () => {
    const { result, store } = renderController(undefined, {
      review: {
        onAddComment: vi.fn().mockRejectedValue(new Error("Failed to post comment.")),
      },
    });

    await expect(
      act(async () => {
        await result.current.dependencies.review.onAddComment?.("seg-02", {
          text: "Needs context",
          type: "comment",
        });
      }),
    ).rejects.toThrow("Failed to post comment.");

    expect(store.commentPostError).toBe("Failed to post comment.");
    expect(store.selectedSegmentId).toBe("seg-02");
  });

  it("prompts before navigating away from a dirty segment", () => {
    const onSelectSegment = vi.fn();
    const { result, store } = renderController(undefined, {
      navigation: { onSelectSegment },
    });

    act(() => {
      result.current.dependencies.editing.onTargetChange("seg-02", "Unsaved edit");
    });

    act(() => {
      result.current.dependencies.navigation.onSelectSegment("seg-03");
    });

    expect(store.unsavedNavigationPrompt).toMatchObject({ kind: "segment" });
    expect(onSelectSegment).not.toHaveBeenCalled();
    expect(store.selectedSegmentId).toBe("seg-02");

    act(() => {
      store.confirmUnsavedNavigation();
    });

    expect(onSelectSegment).toHaveBeenCalledWith("seg-03");
    expect(store.selectedSegmentId).toBe("seg-03");
  });

  it("bulk approves checked segments through the review handler", async () => {
    const onApprove = vi.fn().mockResolvedValue("reviewed");
    const { result, store } = renderController(undefined, {
      review: { onApprove },
    });

    act(() => {
      store.toggleSegmentChecked("seg-02", true);
      store.toggleSegmentChecked("seg-03", true);
    });

    await act(async () => {
      await result.current.handleBulkApprove();
    });

    expect(onApprove).toHaveBeenCalledTimes(2);
    expect(store.checkedSegmentIds.size).toBe(0);
  });

  it("delegates queue filter changes to the parent when server filtering is enabled", () => {
    const onQueueFilterChange = vi.fn();
    const { result } = renderController(undefined, {
      queueFilter: "all",
      onQueueFilterChange,
    });

    act(() => {
      result.current.handleQueueFilterChange("needs_review");
    });

    expect(onQueueFilterChange).toHaveBeenCalledWith("needs_review");
  });

  it("reveals agent context after a successful lookup", async () => {
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentContext: vi.fn().mockResolvedValue("Hero title on the sign-in page."),
      },
    });

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    expect(store.revealedAgentContextSegmentIds.has("seg-02")).toBe(true);
    expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe(
      "Hero title on the sign-in page.",
    );
  });

  it("records context lookup failures as format checks", async () => {
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentContext: vi.fn().mockRejectedValue(new Error("Repository not selected.")),
      },
    });

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    expect(store.segmentFormatChecks["seg-02"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "context-lookup-failed-seg-02",
          message: "Repository not selected.",
        }),
      ]),
    );
  });
});
