import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "./cat.fixture";
import {
  addSaveFailureFormatCheck,
  getAiSuggestionForSegment,
  mergeCatWorkspaceState,
} from "./cat-workspace-container";

describe("mergeCatWorkspaceState", () => {
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
    const currentState = {
      ...previousInitialState,
      segments: previousInitialState.segments.map((segment) =>
        segment.id === "seg-02" ? { ...segment, targetText: "Unsaved second" } : segment,
      ),
      segmentFormatChecks: {
        "seg-02": [
          {
            id: "edited-check",
            label: "Edited format",
            status: "pass" as const,
            message: "Edited segment checks are still current.",
          },
        ],
      },
    };
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

    const merged = mergeCatWorkspaceState(previousInitialState, currentState, nextInitialState);

    expect(merged.selectedSegmentId).toBe("seg-02");
    expect(merged.segments).toMatchObject([
      {
        id: "seg-01",
        targetText: "Saved first",
        status: "reviewed",
      },
      {
        id: "seg-02",
        targetText: "Unsaved second",
        status: "pending",
      },
    ]);
    expect(merged.segmentFormatChecks?.["seg-02"]?.[0]).toMatchObject({
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
    const saveFailureCheck = {
      id: "save-failed-seg-02",
      label: "Save failed",
      status: "fail" as const,
      message: "Provider rejected the update.",
      category: "qa" as const,
    };
    const currentState = {
      ...previousInitialState,
      formatChecks: [saveFailureCheck],
      segmentFormatChecks: {
        "seg-02": [saveFailureCheck],
      },
    };
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

    const merged = mergeCatWorkspaceState(previousInitialState, currentState, nextInitialState);

    expect(merged.segmentFormatChecks?.["seg-02"]).toContainEqual(
      expect.objectContaining({
        id: "save-failed-seg-02",
        message: "Provider rejected the update.",
      }),
    );
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
