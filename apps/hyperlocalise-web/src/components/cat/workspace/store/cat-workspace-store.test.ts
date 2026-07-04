import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";

import { createCatWorkspaceStore } from "./cat-workspace-store";
import { addSaveFailureFormatCheck, getAiSuggestionForSegment } from "./cat-workspace-store-utils";

describe("CatWorkspaceStore hydration", () => {
  it("preserves selected segment and unsaved target edits across server refreshes", () => {
    const previousInitialState = createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "first",
          sourceText: "First",
          targetText: "Old first",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "needs_review",
        },
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "Old second",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
    });
    const store = createCatWorkspaceStore(previousInitialState);
    store.setTargetText("seg-02", "Unsaved second");
    store.setFormatChecks(
      "seg-02",
      [
        {
          id: "edited-check",
          label: "Edited format",
          status: "pass",
          message: "Edited segment checks are still current.",
        },
      ],
      false,
    );

    const nextInitialState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "first",
          sourceText: "First",
          targetText: "Saved first",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "reviewed",
        },
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "Old second",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
    });

    store.hydrateFromServerSnapshot(nextInitialState);

    expect(store.selectedSegmentId).toBe("seg-02");
    expect(store.getSegmentView("seg-01")).toMatchObject({
      id: "seg-01",
      targetText: "Saved first",
      status: "reviewed",
    });
    expect(store.getSegmentView("seg-02")).toMatchObject({
      id: "seg-02",
      targetText: "Unsaved second",
      status: "pending",
    });
    expect(store.segmentFormatChecks["seg-02"]?.[0]).toMatchObject({
      id: "edited-check",
    });
  });

  it("preserves save failure checks for unedited segments across server refreshes", () => {
    const previousInitialState = createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segments: [
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "Old second",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
    });
    const store = createCatWorkspaceStore(previousInitialState);
    store.addSaveFailureCheck("seg-02", "Provider rejected the update.", "Save failed");

    const nextInitialState = createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segments: [
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "Old second",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
      segmentFormatChecks: {
        "seg-02": [],
      },
    });

    store.hydrateFromServerSnapshot(nextInitialState);

    expect(store.segmentFormatChecks["seg-02"]).toContainEqual(
      expect.objectContaining({
        id: "save-failed-seg-02",
        message: "Provider rejected the update.",
      }),
    );
  });

  it("keeps lazy-loaded targets when queue snapshots omit target text", () => {
    const initialState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "hero.title",
          sourceText: "Hello",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "ca",
          status: "pending",
        },
      ],
    });
    const store = createCatWorkspaceStore(initialState);

    store.hydrateFromServerSnapshot({
      ...initialState,
      segments: [
        {
          ...initialState.segments![0]!,
          targetText: "Hola",
          status: "reviewed",
        },
      ],
    });

    store.hydrateFromServerSnapshot({
      ...initialState,
      segments: [
        {
          ...initialState.segments![0]!,
          targetText: "",
          status: "pending",
        },
      ],
    });

    expect(store.getSegmentView("seg-01")).toMatchObject({
      targetText: "Hola",
    });
    expect([...store.dirtySegmentIds]).toEqual([]);
  });

  it("keeps lazy-loaded comments when queue snapshots omit comment bodies", () => {
    const queueState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "hero.title",
          sourceText: "Hello",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "fr",
          status: "pending",
        },
      ],
    });
    const store = createCatWorkspaceStore(queueState);
    const loadedComments = [
      {
        id: "comment-1",
        type: "comment" as const,
        status: null,
        text: "Keep this concise.",
        createdAt: "2026-07-04T00:00:00.000Z",
        locale: "fr",
      },
    ];

    store.hydrateFromServerSnapshot({
      ...queueState,
      segments: [{ ...queueState.segments![0]!, comments: loadedComments }],
    });
    store.hydrateFromServerSnapshot(queueState);

    expect(store.getSegmentView("seg-01")?.comments).toEqual(loadedComments);
    expect(store.getSegmentView("seg-01")?.tags).toEqual(["1 comment"]);
    expect(store.segmentComments.has("seg-01")).toBe(true);
  });

  it("stores file locale context separately from queue segment metadata", () => {
    const store = createCatWorkspaceStore(
      createCatWorkspaceState({
        fileContext: {
          sourcePath: "locales/en.json",
          filename: "en.json",
          sourceLocale: "en-GB",
          targetLocale: "fr-CA",
          providerKind: "crowdin",
          canEditTranslations: true,
          canAddComments: true,
        },
        segments: [
          {
            id: "seg-01",
            index: 1,
            key: "hero.title",
            sourceText: "Hello",
            targetText: "",
            sourceLocale: "en-GB",
            targetLocale: "fr-CA",
            status: "pending",
          },
        ],
      }),
    );

    expect(store.fileContext).toMatchObject({
      sourceLocale: "en-GB",
      targetLocale: "fr-CA",
      sourcePath: "locales/en.json",
    });
    expect(store.queueSegments[0]).toEqual({
      id: "seg-01",
      index: 1,
      key: "hero.title",
      sourceText: "Hello",
    });
    expect(store.getSegmentView("seg-01")).toMatchObject({
      sourceLocale: "en-GB",
      targetLocale: "fr-CA",
    });
  });

  it("tracks dirty segment ids from draft baselines", () => {
    const store = createCatWorkspaceStore(
      createCatWorkspaceState({
        segments: [
          {
            id: "seg-1",
            index: 1,
            key: "hello",
            sourceText: "Hello",
            targetText: "Saved",
            sourceLocale: "en",
            targetLocale: "vi",
            status: "pending",
          },
        ],
      }),
    );

    store.setTargetText("seg-1", "Unsaved edit");
    expect([...store.dirtySegmentIds]).toEqual(["seg-1"]);

    store.markSegmentSaved("seg-1", "Unsaved edit");
    expect([...store.dirtySegmentIds]).toEqual([]);
  });
});

describe("addSaveFailureFormatCheck", () => {
  it("adds the save failure to file-level and selected segment format checks", () => {
    const state = createCatWorkspaceState({
      formatChecks: [
        {
          id: "save-failed-old",
          label: "Save failed",
          status: "fail",
          message: "Previous failure.",
          category: "qa",
        },
        {
          id: "file-check",
          label: "File check",
          status: "warn",
          message: "Visible through the file-level fallback.",
        },
      ],
      segmentFormatChecks: {
        "seg-02": [
          {
            id: "segment-check",
            label: "Segment check",
            status: "warn",
            message: "Visible for the selected segment.",
          },
        ],
      },
    });

    const next = addSaveFailureFormatCheck(
      state,
      "seg-02",
      "Provider rejected the update.",
      "Save failed",
    );

    expect(next.formatChecks).toMatchObject([
      {
        id: "save-failed-seg-02",
        message: "Provider rejected the update.",
      },
      {
        id: "file-check",
      },
    ]);
    expect(next.segmentFormatChecks?.["seg-02"]).toMatchObject([
      {
        id: "save-failed-seg-02",
        message: "Provider rejected the update.",
      },
      {
        id: "segment-check",
      },
    ]);
  });
});

describe("getAiSuggestionForSegment", () => {
  it("prefers segment-level AI suggestions over the file-level fallback", () => {
    const state = createCatWorkspaceState({
      intelligence: {
        ...createCatWorkspaceState().intelligence,
        aiSuggestion: "Use the file-level suggestion.",
      },
      segmentIntelligence: {
        "seg-02": {
          ...createCatWorkspaceState().intelligence,
          aiSuggestion: "Use the segment-level suggestion.",
        },
      },
    });

    expect(getAiSuggestionForSegment(state, "seg-02")).toBe("Use the segment-level suggestion.");
  });
});
