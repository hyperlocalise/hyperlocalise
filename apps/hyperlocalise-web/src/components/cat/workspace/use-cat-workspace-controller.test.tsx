// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState, mockValidateFormat } from "@/components/cat/shared/cat.fixture";
import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";
import type { CatSegmentConcordanceResult } from "@/components/cat/shared/dependencies";
import type { CatFormatCheck } from "@/components/cat/shared/types";

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
  const { services: servicesOverride, review, editing, navigation, ...rest } = overrides;

  return {
    store,
    ...renderHook(
      () =>
        useCatWorkspaceController({
          store,
          initialState,
          services: {
            validateFormat: mockValidateFormat,
            ...(servicesOverride as object),
          },
          review: review as never,
          editing: editing as never,
          navigation: navigation as never,
          ...rest,
        }),
      { wrapper: CatTestProviders },
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCatWorkspaceController", () => {
  it("debounces format checks and validates the latest target text", async () => {
    const validateFormat = vi.fn(mockValidateFormat);
    const { result, store } = renderController(undefined, {
      services: { validateFormat },
    });

    await waitFor(() => expect(validateFormat).toHaveBeenCalled());
    validateFormat.mockClear();

    act(() => {
      result.current.dependencies.editing.onTargetChange("seg-02", "Deux");
      result.current.dependencies.editing.onTargetChange("seg-02", "Deuxième");
    });

    expect(validateFormat).not.toHaveBeenCalled();
    await waitFor(() => expect(validateFormat).toHaveBeenCalledTimes(1));
    expect(validateFormat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seg-02" }),
      "Deuxième",
      expect.any(Array),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(store.getSegmentView("seg-02")?.targetText).toBe("Deuxième");
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

    expect(store.getSegmentView("seg-02")?.targetText).toBe("Suggestion IA");
  });

  it("waits for the intelligence panel before running concordance lookup", async () => {
    const lookupSegmentConcordance = vi.fn().mockResolvedValue({
      glossaryTerms: [],
      translationMemoryMatches: [],
    } satisfies CatSegmentConcordanceResult);

    const { store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
      },
    });

    await waitFor(() => expect(store.segmentFormatChecks["seg-02"]?.length).toBeGreaterThan(0));
    expect(lookupSegmentConcordance).not.toHaveBeenCalled();
  });

  it("auto-fills empty targets from high-confidence TM matches after intelligence loads", async () => {
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

    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance: vi.fn().mockResolvedValue(concordance),
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() => expect(store.getSegmentView("seg-02")?.targetText).toBe("Deuxième"));
    expect(store.autoFilledSegmentIds.has("seg-02")).toBe(true);
    expect(store.isLoadingConcordance).toBe(false);
  });

  it("clears concordance loading when AI review runs during an in-flight lookup", async () => {
    let resolveConcordance: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const concordancePromise = new Promise<CatSegmentConcordanceResult>((resolve) => {
      resolveConcordance = resolve;
    });

    const lookupSegmentConcordance = vi.fn().mockReturnValue(concordancePromise);
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    expect(store.isLoadingConcordance).toBe(true);

    await act(async () => {
      const reviewPromise = result.current.dependencies.review.onReviewWithAi("seg-02");
      resolveConcordance?.({
        glossaryTerms: [
          {
            id: "term-1",
            source: "Second",
            target: "Deuxième",
            approved: true,
            forbidden: false,
          },
        ],
        translationMemoryMatches: [],
      });
      await concordancePromise;
      await reviewPromise;
    });

    await waitFor(() => expect(store.isLoadingConcordance).toBe(false));
    expect(store.segmentIntelligence["seg-02"]?.glossaryTerms).toEqual([
      expect.objectContaining({ id: "term-1", target: "Deuxième" }),
    ]);
  });

  it("keeps concordance results while format checks run in parallel", async () => {
    let resolveConcordance: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const concordancePromise = new Promise<CatSegmentConcordanceResult>((resolve) => {
      resolveConcordance = resolve;
    });

    const lookupSegmentConcordance = vi.fn().mockReturnValue(concordancePromise);
    const validateFormat = vi
      .fn()
      .mockImplementation(
        () => new Promise<CatFormatCheck[]>((resolve) => setTimeout(() => resolve([]), 50)),
      );
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
        validateFormat,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    expect(store.isLoadingConcordance).toBe(true);
    await waitFor(() => expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveConcordance?.({
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
      });
      await concordancePromise;
    });

    await waitFor(() =>
      expect(store.segmentIntelligence["seg-02"]?.translationMemoryMatches).toEqual([
        expect.objectContaining({ id: "tm-1", targetText: "Deuxième" }),
      ]),
    );
  });

  it("auto-fills when intelligence panel joins an in-flight AI review concordance lookup", async () => {
    let resolveConcordance: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const concordancePromise = new Promise<CatSegmentConcordanceResult>((resolve) => {
      resolveConcordance = resolve;
    });

    const lookupSegmentConcordance = vi.fn().mockReturnValue(concordancePromise);
    const generateAiRecommendation = vi.fn().mockResolvedValue({
      aiSuggestion: "Suggestion IA",
      aiReasoning: "Because TM",
      formatChecks: [],
    });

    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
        generateAiRecommendation,
      },
    });

    await act(async () => {
      const reviewPromise = result.current.dependencies.review.onReviewWithAi("seg-02");
      result.current.handleIntelligencePanelVisible("seg-02");
      resolveConcordance?.({
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
      });
      await concordancePromise;
      await reviewPromise;
    });

    expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1);
    expect(store.getSegmentView("seg-02")?.targetText).toBe("Deuxième");
    expect(store.autoFilledSegmentIds.has("seg-02")).toBe(true);
  });

  it("does not start a duplicate concordance lookup when AI review runs during an in-flight lookup", async () => {
    let resolveConcordance: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const concordancePromise = new Promise<CatSegmentConcordanceResult>((resolve) => {
      resolveConcordance = resolve;
    });

    const lookupSegmentConcordance = vi.fn().mockReturnValue(concordancePromise);
    const generateAiRecommendation = vi.fn().mockResolvedValue({
      aiSuggestion: "Suggestion IA",
      aiReasoning: "Because TM",
      formatChecks: [],
    });

    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
        generateAiRecommendation,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    expect(store.isLoadingConcordance).toBe(true);

    await act(async () => {
      const reviewPromise = result.current.dependencies.review.onReviewWithAi("seg-02");
      resolveConcordance?.({
        glossaryTerms: [],
        translationMemoryMatches: [],
      });
      await concordancePromise;
      await reviewPromise;
    });

    expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1);
  });

  it("invokes the onReviewWithAi review override before AI review", async () => {
    const onReviewWithAi = vi.fn();
    const generateAiRecommendation = vi.fn().mockResolvedValue({
      aiSuggestion: "Suggestion IA",
      aiReasoning: "Because TM",
      formatChecks: [],
    });
    const { result } = renderController(undefined, {
      review: { onReviewWithAi },
      services: { generateAiRecommendation },
    });

    await act(async () => {
      await result.current.dependencies.review.onReviewWithAi("seg-02");
    });

    expect(onReviewWithAi).toHaveBeenCalledWith("seg-02");
    expect(generateAiRecommendation).toHaveBeenCalledTimes(1);
  });

  it("runs generateAiRecommendation once when Review with AI is triggered twice during concordance", async () => {
    let resolveConcordance: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const concordancePromise = new Promise<CatSegmentConcordanceResult>((resolve) => {
      resolveConcordance = resolve;
    });

    const lookupSegmentConcordance = vi.fn().mockReturnValue(concordancePromise);
    const generateAiRecommendation = vi.fn().mockResolvedValue({
      aiSuggestion: "Suggestion IA",
      aiReasoning: "Because TM",
      formatChecks: [],
    });

    const { result } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
        generateAiRecommendation,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() => expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1));

    await act(async () => {
      const firstReview = result.current.dependencies.review.onReviewWithAi("seg-02");
      const secondReview = result.current.dependencies.review.onReviewWithAi("seg-02");
      resolveConcordance?.({
        glossaryTerms: [],
        translationMemoryMatches: [],
      });
      await concordancePromise;
      await Promise.all([firstReview, secondReview]);
    });

    expect(generateAiRecommendation).toHaveBeenCalledTimes(1);
  });

  it("does not refetch concordance when AI review runs after intelligence panel loaded it", async () => {
    const lookupSegmentConcordance = vi.fn().mockResolvedValue({
      glossaryTerms: [
        {
          id: "term-1",
          source: "Second",
          target: "Deuxième",
          approved: true,
          forbidden: false,
        },
      ],
      translationMemoryMatches: [],
    } satisfies CatSegmentConcordanceResult);
    const generateAiRecommendation = vi.fn().mockResolvedValue({
      aiSuggestion: "Suggestion IA",
      aiReasoning: "Because TM",
      formatChecks: [],
    });

    const { result } = renderController(undefined, {
      services: {
        lookupSegmentConcordance,
        generateAiRecommendation,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() => expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.dependencies.review.onReviewWithAi("seg-02");
    });

    expect(lookupSegmentConcordance).toHaveBeenCalledTimes(1);
    expect(generateAiRecommendation).toHaveBeenCalledTimes(1);
  });

  it("records concordance lookup failures as format checks after intelligence loads", async () => {
    const { result, store } = renderController(undefined, {
      services: {
        validateFormat: undefined,
        lookupSegmentConcordance: vi.fn().mockRejectedValue(new Error("TM unavailable")),
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
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
    expect(store.getSegmentView("seg-02")?.status).toBe("reviewed");
  });

  it("adds save failure checks when approve fails", async () => {
    const { result, store } = renderController(undefined, {
      review: {
        onApprove: vi.fn().mockRejectedValue(new Error("Provider rejected the update.")),
      },
    });

    await waitFor(() => expect(store.segmentFormatChecks["seg-02"]?.length).toBeGreaterThan(0));

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
    const lookupSegmentContext = vi.fn().mockImplementation((_segment, options) => {
      if (options?.cachedOnly) {
        return Promise.resolve(null);
      }
      return Promise.resolve("Hero title on the sign-in page.");
    });
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentContext,
      },
    });

    await waitFor(() => expect(store.segmentFormatChecks["seg-02"]?.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    expect(store.revealedAgentContextSegmentIds.has("seg-02")).toBe(true);
    expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe(
      "Hero title on the sign-in page.",
    );
  });

  it("lazy-loads cached agent context for the selected segment", async () => {
    const lookupSegmentContext = vi.fn().mockResolvedValue("Cached context from the repository.");
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentContext,
      },
    });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() =>
      expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe(
        "Cached context from the repository.",
      ),
    );
    expect(store.revealedAgentContextSegmentIds.has("seg-02")).toBe(true);
    expect(lookupSegmentContext).toHaveBeenCalledWith(expect.objectContaining({ id: "seg-02" }), {
      cachedOnly: true,
    });
  });

  it("retries cached agent context lookup when the lookup function changes", async () => {
    const lookupSegmentContext = vi.fn().mockResolvedValue(null);
    const nextLookupSegmentContext = vi.fn().mockResolvedValue("Cached context from another repo.");
    const services = { lookupSegmentContext };
    const { result, rerender, store } = renderController(undefined, { services });

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() => expect(lookupSegmentContext).toHaveBeenCalledTimes(1));

    services.lookupSegmentContext = nextLookupSegmentContext;
    rerender();

    act(() => {
      result.current.handleIntelligencePanelVisible("seg-02");
    });

    await waitFor(() =>
      expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe(
        "Cached context from another repo.",
      ),
    );
    expect(nextLookupSegmentContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seg-02" }),
      {
        cachedOnly: true,
      },
    );
  });

  it("stores null from full agent context lookups and allows retry", async () => {
    const lookupSegmentContext = vi.fn().mockResolvedValue(null);
    const nextLookupSegmentContext = vi
      .fn()
      .mockResolvedValue("Cached context from the repository.");
    const services = { lookupSegmentContext };
    const { result, rerender, store } = renderController(undefined, { services });

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    expect(store.segmentIntelligence["seg-02"]?.agentContext).toBeNull();

    services.lookupSegmentContext = nextLookupSegmentContext;
    rerender();

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    expect(nextLookupSegmentContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seg-02" }),
      { forceRefresh: false },
    );
    expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe(
      "Cached context from the repository.",
    );
  });

  it("refreshes existing agent context when requested", async () => {
    const initialState = createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segmentIntelligence: {
        "seg-02": {
          ...createCatWorkspaceState().intelligence,
          agentContext: "Old context.",
        },
      },
    });
    const lookupSegmentContext = vi.fn().mockResolvedValue("Updated context.");
    const { result, store } = renderController(initialState, {
      services: {
        lookupSegmentContext,
      },
    });

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02", { forceRefresh: true });
    });

    expect(lookupSegmentContext).toHaveBeenCalledWith(expect.objectContaining({ id: "seg-02" }), {
      forceRefresh: true,
    });
    expect(store.segmentIntelligence["seg-02"]?.agentContext).toBe("Updated context.");
  });

  it("records context lookup failures as format checks", async () => {
    const lookupSegmentContext = vi.fn().mockImplementation((_segment, options) => {
      if (options?.cachedOnly) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error("Repository not selected."));
    });
    const { result, store } = renderController(undefined, {
      services: {
        lookupSegmentContext,
      },
    });

    await waitFor(() => expect(store.segmentFormatChecks["seg-02"]?.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.dependencies.review.onAskQuestion("seg-02");
    });

    await waitFor(() =>
      expect(store.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "context-lookup-failed-seg-02",
            message: "Repository not selected.",
          }),
        ]),
      ),
    );
  });
});
