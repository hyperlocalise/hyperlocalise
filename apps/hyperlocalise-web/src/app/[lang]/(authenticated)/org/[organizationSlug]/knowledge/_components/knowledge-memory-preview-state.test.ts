import { describe, expect, it } from "vite-plus/test";

import {
  formatMemoryReductionPercent,
  getKnowledgeMemoryPreviewState,
} from "./knowledge-memory-preview-state";

describe("getKnowledgeMemoryPreviewState", () => {
  it("enables preview when a locale or source query is present", () => {
    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "en-AU",
        sourceText: "",
        isPreviewing: false,
      }),
    ).toMatchObject({
      hasQuery: true,
      canPreview: true,
    });
  });

  it("blocks preview while loading or when the query is empty", () => {
    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "",
        sourceText: "",
        isPreviewing: false,
      }),
    ).toMatchObject({
      hasQuery: false,
      canPreview: false,
    });

    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "fr-FR",
        sourceText: "Launch globally",
        isPreviewing: true,
      }),
    ).toMatchObject({
      hasQuery: true,
      canPreview: false,
    });
  });
});

describe("formatMemoryReductionPercent", () => {
  it("formats rounded non-negative reduction percentages", () => {
    expect(formatMemoryReductionPercent(91.25)).toBe("91% smaller");
    expect(formatMemoryReductionPercent(-4)).toBe("0% smaller");
  });
});
