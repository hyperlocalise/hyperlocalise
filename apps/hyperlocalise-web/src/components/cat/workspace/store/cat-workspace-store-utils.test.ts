import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";

import {
  addSaveFailureFormatCheck,
  collectSegmentsWithAgentContext,
  getAiSuggestionForSegment,
  glossaryTermsForSegment,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
  resolveSegmentIntelligenceForDisplay,
  withoutSaveFailureChecks,
} from "./cat-workspace-store-utils";

describe("withoutSaveFailureChecks", () => {
  it("removes save-failed checks from a list", () => {
    expect(
      withoutSaveFailureChecks([
        { id: "save-failed-seg-01", label: "Save", status: "fail", message: "Failed" },
        { id: "format-1", label: "Format", status: "pass", message: "OK" },
      ]),
    ).toEqual([{ id: "format-1", label: "Format", status: "pass", message: "OK" }]);
  });
});

describe("hasSaveFailureCheck", () => {
  it("detects save-failed checks", () => {
    expect(
      hasSaveFailureCheck([
        { id: "save-failed-seg-01", label: "Save", status: "fail", message: "x" },
      ]),
    ).toBe(true);
    expect(
      hasSaveFailureCheck([{ id: "format-1", label: "Format", status: "pass", message: "OK" }]),
    ).toBe(false);
  });
});

describe("glossaryTermsForSegment", () => {
  it("prefers segment-level glossary terms over file-level defaults", () => {
    const state = createCatWorkspaceState({
      intelligence: {
        ...createCatWorkspaceState().intelligence,
        glossaryTerms: [
          { id: "file-term", source: "File", target: "Fichier", approved: true, forbidden: false },
        ],
      },
      segmentIntelligence: {
        "seg-02": {
          glossaryTerms: [
            {
              id: "seg-term",
              source: "Segment",
              target: "Segmente",
              approved: true,
              forbidden: false,
            },
          ],
        },
      },
    });

    expect(glossaryTermsForSegment(state, "seg-02")).toEqual([
      { id: "seg-term", source: "Segment", target: "Segmente", approved: true, forbidden: false },
    ]);
    expect(glossaryTermsForSegment(state, "missing")).toEqual(state.intelligence.glossaryTerms);
  });
});

describe("collectSegmentsWithAgentContext", () => {
  it("returns segment IDs with non-empty trimmed agent context", () => {
    const state = createCatWorkspaceState({
      segmentIntelligence: {
        "seg-01": { glossaryTerms: [], agentContext: "Context one." },
        "seg-02": { glossaryTerms: [], agentContext: "   " },
        "seg-03": { glossaryTerms: [], agentContext: null },
      },
    });

    expect([...collectSegmentsWithAgentContext(state)]).toEqual(["seg-01"]);
  });
});

describe("mergeSegmentIntelligenceOnHydrate", () => {
  const baseIntelligence = createCatWorkspaceState().intelligence;

  it("preserves current agent context when the next snapshot omits it", () => {
    const merged = mergeSegmentIntelligenceOnHydrate({
      nextInitialState: createCatWorkspaceState({
        segmentIntelligence: { "seg-02": { glossaryTerms: [] } },
      }),
      currentState: {
        intelligence: baseIntelligence,
        segmentIntelligence: {
          "seg-02": { glossaryTerms: [], agentContext: "Cached context." },
        },
      },
      segmentId: "seg-02",
      existing: undefined,
    });

    expect(merged?.agentContext).toBe("Cached context.");
  });

  it("preserves current concordance when the next snapshot has none", () => {
    const merged = mergeSegmentIntelligenceOnHydrate({
      nextInitialState: createCatWorkspaceState({
        segmentIntelligence: { "seg-02": { glossaryTerms: [] } },
      }),
      currentState: {
        intelligence: baseIntelligence,
        segmentIntelligence: {
          "seg-02": {
            glossaryTerms: [
              {
                id: "term-1",
                source: "Second",
                target: "Deuxième",
                approved: true,
                forbidden: false,
              },
            ],
            translationMemoryMatches: [
              { id: "tm-1", sourceText: "Second", targetText: "Deuxième", matchPercent: 100 },
            ],
          },
        },
      },
      segmentId: "seg-02",
      existing: undefined,
    });

    expect(merged?.glossaryTerms).toEqual([
      { id: "term-1", source: "Second", target: "Deuxième", approved: true, forbidden: false },
    ]);
    expect(merged?.translationMemoryMatches).toEqual([
      { id: "tm-1", sourceText: "Second", targetText: "Deuxième", matchPercent: 100 },
    ]);
  });

  it("preserves current visual context when the next snapshot omits it", () => {
    const visualContext = { screenshots: [] };
    const merged = mergeSegmentIntelligenceOnHydrate({
      nextInitialState: createCatWorkspaceState({
        segmentIntelligence: { "seg-02": { glossaryTerms: [] } },
      }),
      currentState: {
        intelligence: baseIntelligence,
        segmentIntelligence: {
          "seg-02": { glossaryTerms: [], visualContext },
        },
      },
      segmentId: "seg-02",
      existing: undefined,
    });

    expect(merged?.visualContext).toEqual(visualContext);
  });
});

describe("resolveSegmentIntelligenceForDisplay", () => {
  it("returns file intelligence when the segment has no override", () => {
    const state = createCatWorkspaceState();

    expect(resolveSegmentIntelligenceForDisplay(state, "missing")).toEqual(state.intelligence);
  });
});

describe("addSaveFailureFormatCheck", () => {
  it("replaces prior save failures for the same segment", () => {
    const state = createCatWorkspaceState({
      formatChecks: [
        { id: "save-failed-seg-02", label: "Save failed", status: "fail", message: "Old failure." },
      ],
      segmentFormatChecks: {
        "seg-02": [
          {
            id: "save-failed-seg-02",
            label: "Save failed",
            status: "fail",
            message: "Old failure.",
          },
        ],
      },
    });

    const next = addSaveFailureFormatCheck(state, "seg-02", "New failure.", "Save failed");

    expect(next.formatChecks.filter((check) => check.id.startsWith("save-failed-"))).toEqual([
      expect.objectContaining({ id: "save-failed-seg-02", message: "New failure." }),
    ]);
    expect(
      next.segmentFormatChecks?.["seg-02"]?.filter((check) => check.id.startsWith("save-failed-")),
    ).toEqual([expect.objectContaining({ id: "save-failed-seg-02", message: "New failure." })]);
  });
});

describe("getAiSuggestionForSegment", () => {
  it("falls back to file-level suggestions for unknown segments", () => {
    const state = createCatWorkspaceState({
      intelligence: {
        ...createCatWorkspaceState().intelligence,
        aiSuggestion: "File suggestion.",
      },
    });

    expect(getAiSuggestionForSegment(state, "missing")).toBe("File suggestion.");
  });
});
