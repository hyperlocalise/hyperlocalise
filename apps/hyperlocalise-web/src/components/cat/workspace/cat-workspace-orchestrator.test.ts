import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";

import { createCatWorkspace } from "./cat-workspace-orchestrator";
import {
  addSaveFailureFormatCheck,
  getAiSuggestionForSegment,
  resolveSegmentIntelligenceForDisplay,
} from "./store/cat-workspace-store-utils";

describe("CatWorkspaceOrchestrator hydration", () => {
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
    const store = createCatWorkspace(previousInitialState);
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
      targetText: "Old first",
      status: "needs_review",
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
    const store = createCatWorkspace(previousInitialState);
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

  it("preserves lazy-loaded translation when paginated queue snapshots rehydrate twice", () => {
    const pageOne = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      queueSegments: [
        { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
        { id: "seg-02", index: 2, key: "settings.title", sourceText: "Settings" },
      ],
    });
    const store = createCatWorkspace(pageOne);

    store.applySegmentTarget("seg-01", {
      text: "Bonjour",
      externalTranslationId: "translation-1",
      isApproved: false,
    });

    const pageOneAndTwo = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      queueSegments: [
        { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
        { id: "seg-02", index: 2, key: "settings.title", sourceText: "Settings" },
        { id: "seg-03", index: 3, key: "footer.title", sourceText: "Footer" },
      ],
    });

    store.hydrateFromServerSnapshot(pageOneAndTwo);
    store.hydrateFromServerSnapshot(pageOneAndTwo);

    expect(store.getSegmentView("seg-01")?.targetText).toBe("Bonjour");
    expect(store.getSegmentView("seg-03")?.targetText).toBe("");
  });

  it("removes stale unedited segments while preserving dirty drafts on queue refresh", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-02",
        queueSegments: [
          { id: "seg-01", index: 1, key: "first", sourceText: "First" },
          { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
          { id: "seg-03", index: 3, key: "third", sourceText: "Third" },
        ],
      }),
    );
    store.setTargetText("seg-03", "Unsaved third");
    store.toggleSegmentChecked("seg-02", true);

    store.hydrateFromServerSnapshot(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        queueSegments: [{ id: "seg-01", index: 1, key: "first", sourceText: "First" }],
      }),
    );

    expect(store.queueSegments.map((segment) => segment.id)).toEqual(["seg-01", "seg-03"]);
    expect(store.getSegmentView("seg-02")).toBeUndefined();
    expect(store.getSegmentView("seg-03")?.targetText).toBe("Unsaved third");
    expect(store.selectedSegmentId).toBe("seg-01");
    expect([...store.checkedSegmentIds]).toEqual([]);
  });

  it("keeps the selected dirty segment visible when a queue refresh filters it out", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-02",
        queueSegments: [
          { id: "seg-01", index: 1, key: "first", sourceText: "First" },
          { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
        ],
      }),
    );
    store.setTargetText("seg-02", "Unsaved second");

    store.hydrateFromServerSnapshot(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        queueSegments: [{ id: "seg-01", index: 1, key: "first", sourceText: "First" }],
      }),
    );

    expect(store.selectedSegmentId).toBe("seg-02");
    expect(store.queueSegments.map((segment) => segment.id)).toEqual(["seg-01", "seg-02"]);
    expect(store.getSegmentView("seg-02")?.targetText).toBe("Unsaved second");
  });

  it("uses the new selected segment checks when a refresh removes the previous selection", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-02",
        queueSegments: [
          { id: "seg-01", index: 1, key: "first", sourceText: "First" },
          { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
        ],
        formatChecks: [
          {
            id: "old-selected-check",
            label: "Old selected check",
            status: "warn",
            message: "This belongs to the removed segment.",
          },
        ],
      }),
    );

    store.hydrateFromServerSnapshot(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        queueSegments: [{ id: "seg-01", index: 1, key: "first", sourceText: "First" }],
        formatChecks: [
          {
            id: "new-selected-check",
            label: "New selected check",
            status: "pass",
            message: "This belongs to the remaining segment.",
          },
        ],
      }),
    );

    expect(store.selectedSegmentId).toBe("seg-01");
    expect(store.formatChecks.map((check) => check.id)).toEqual(["new-selected-check"]);
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
    const store = createCatWorkspace(initialState);

    store.applySegmentTarget("seg-01", {
      text: "Hola",
      externalTranslationId: "translation-1",
      isApproved: true,
    });

    store.hydrateFromServerSnapshot(initialState);

    expect(store.getSegmentView("seg-01")).toMatchObject({
      targetText: "Hola",
    });
    expect([...store.dirtySegmentIds]).toEqual([]);
  });

  it("does not overwrite unsaved target edits when lazy target sync refetches", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        queueSegments: [{ id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" }],
      }),
    );

    store.applySegmentTarget("seg-01", {
      text: "Bonjour",
      externalTranslationId: "translation-1",
      isApproved: false,
    });
    store.setTargetText("seg-01", "Bonjour modifié");

    store.applySegmentTarget("seg-01", {
      text: "Bonjour",
      externalTranslationId: "translation-1",
      isApproved: true,
    });

    expect(store.getSegmentView("seg-01")).toMatchObject({
      targetText: "Bonjour modifié",
      status: "reviewed",
    });
    expect(store.dirtySegmentIds.has("seg-01")).toBe(true);
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
    const store = createCatWorkspace(queueState);
    store.applySegmentComments("seg-01", [
      {
        externalCommentId: "comment-1",
        type: "comment",
        status: null,
        text: "Keep this concise.",
        createdAt: "2026-07-04T00:00:00.000Z",
        locale: "fr",
        author: null,
      },
    ]);
    store.hydrateFromServerSnapshot(queueState);
    expect(store.getSegmentView("seg-01")?.comments).toEqual([
      {
        id: "comment-1",
        type: "comment",
        status: null,
        text: "Keep this concise.",
        createdAt: "2026-07-04T00:00:00.000Z",
        locale: "fr",
        author: null,
      },
    ]);
    expect(store.segmentComments.has("seg-01")).toBe(true);
  });

  it("preserves skipped status for empty target segments on initial hydration", () => {
    const initialState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "empty",
          sourceText: "Empty segment",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "fr",
          status: "skipped",
        },
        {
          id: "seg-02",
          index: 2,
          key: "pending",
          sourceText: "Pending segment",
          targetText: "",
          sourceLocale: "en",
          targetLocale: "fr",
          status: "pending",
        },
      ],
    });
    const store = createCatWorkspace(initialState);

    expect(store.matchesQueueFilter("seg-01", "skipped")).toBe(true);
    expect(store.matchesQueueFilter("seg-02", "skipped")).toBe(false);
    expect(store.getQueuePanelSegments("skipped", false)).toEqual([
      expect.objectContaining({ id: "seg-01", status: "skipped" }),
    ]);
  });

  it("creates a draft when skipping an unedited pending segment", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        segments: [],
        queueSegments: [
          { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
          { id: "seg-02", index: 2, key: "footer.title", sourceText: "Footer" },
        ],
      }),
    );

    store.setSegmentStatus("seg-01", "skipped");

    expect(store.drafts.get("seg-01")).toMatchObject({
      targetText: "",
      status: "skipped",
    });
    expect(store.matchesQueueFilter("seg-01", "skipped")).toBe(true);
    expect(store.getQueuePanelSegments("skipped", false)).toEqual([
      expect.objectContaining({ id: "seg-01", status: "skipped" }),
    ]);
  });

  it("stores file locale context separately from queue segment metadata", () => {
    const store = createCatWorkspace(
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
    const store = createCatWorkspace(
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

describe("resolveSegmentIntelligenceForDisplay", () => {
  it("falls back to file-level AI fields when hydrated segment intelligence omits them", () => {
    const state = createCatWorkspaceState({
      intelligence: {
        ...createCatWorkspaceState().intelligence,
        aiSuggestion: "Use the file-level suggestion.",
        aiReasoning: "File-level reasoning.",
      },
      segmentIntelligence: {
        "seg-02": {
          glossaryTerms: [],
          productMeaning: "Card description",
          maxLength: 80,
        },
      },
    });

    expect(resolveSegmentIntelligenceForDisplay(state, "seg-02")).toEqual(
      expect.objectContaining({
        productMeaning: "Card description",
        maxLength: 80,
        aiSuggestion: "Use the file-level suggestion.",
        aiReasoning: "File-level reasoning.",
      }),
    );
  });
});
