import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "./cat.fixture";
import { mergeCatWorkspaceState } from "./cat-workspace-container";

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
});
