import { describe, expect, it } from "vite-plus/test";

import { CatIntelligenceStore } from "./cat-intelligence-store";
import { CatQueueStore } from "./cat-queue-store";
import { CatSegmentStore } from "./cat-segment-store";

describe("CAT workspace domain stores", () => {
  it("keeps queue selection and checked IDs within the current queue", () => {
    const queue = new CatQueueStore();
    queue.replace([
      { id: "seg-01", index: 1, key: "first", sourceText: "First" },
      { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
    ]);
    queue.select("seg-02");
    queue.selectAll(["seg-01", "seg-02"]);

    queue.replace([{ id: "seg-01", index: 1, key: "first", sourceText: "First" }]);

    expect(queue.selectedSegmentId).toBe("seg-01");
    expect([...queue.checkedSegmentIds]).toEqual(["seg-01"]);
  });

  it("owns segment drafts independently from queue metadata", () => {
    const segments = new CatSegmentStore();
    segments.setTargetText("seg-01", "Draft", true);

    expect(segments.dirtySegmentIds.has("seg-01")).toBe(true);
    expect(segments.removeIfClean("seg-01")).toBe(false);

    segments.markSaved("seg-01", "Saved", "needs_review", true);
    expect(segments.removeIfClean("seg-01")).toBe(true);
  });

  it("owns segment intelligence and selected checks", () => {
    const intelligence = new CatIntelligenceStore();
    intelligence.mergeSegment("seg-01", {
      glossaryTerms: [],
      aiSuggestion: "Suggestion",
    });
    intelligence.setChecks(
      "seg-01",
      [{ id: "check", label: "Check", status: "pass", message: "Passed" }],
      true,
    );

    expect(intelligence.bySegment["seg-01"]?.aiSuggestion).toBe("Suggestion");
    expect(intelligence.formatChecks[0]?.id).toBe("check");
  });
});
