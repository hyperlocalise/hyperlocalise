import { describe, expect, it } from "vite-plus/test";

import { CatIntelligenceStore } from "./cat-intelligence-store";
import { CatQueueStore } from "./cat-queue-store";
import { CatSegmentDraft } from "./cat-segment-draft";
import { CatSegmentStore } from "./cat-segment-store";
import { CatWorkspaceUiStore } from "./cat-workspace-ui-store";

const queueSegments = [
  { id: "seg-01", index: 1, key: "first", sourceText: "First" },
  { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
  { id: "seg-03", index: 3, key: "third", sourceText: "Third" },
] as const;

describe("CatQueueStore", () => {
  it("sorts segments by index", () => {
    const queue = new CatQueueStore();
    queue.replace([
      { id: "seg-03", index: 3, key: "third", sourceText: "Third" },
      { id: "seg-01", index: 1, key: "first", sourceText: "First" },
    ]);

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-03"]);
  });

  it("keeps queue selection and checked IDs within the current queue", () => {
    const queue = new CatQueueStore();
    queue.replace(queueSegments.slice(0, 2));
    queue.select("seg-02");
    queue.selectAll(["seg-01", "seg-02"]);

    queue.replace([queueSegments[0]]);

    expect(queue.selectedSegmentId).toBe("seg-01");
    expect([...queue.checkedSegmentIds]).toEqual(["seg-01"]);
  });

  it("merges segments without dropping existing queue entries", () => {
    const queue = new CatQueueStore();
    queue.replace([queueSegments[0]]);
    queue.merge([queueSegments[1]]);

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-02"]);
  });

  it("removes a segment and its checked state", () => {
    const queue = new CatQueueStore();
    queue.replace([...queueSegments]);
    queue.toggleChecked("seg-02", true);

    queue.remove("seg-02");

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-03"]);
    expect(queue.checkedSegmentIds.has("seg-02")).toBe(false);
  });

  it("clears checked segments when the filter changes", () => {
    const queue = new CatQueueStore();
    queue.replace([...queueSegments]);
    queue.toggleChecked("seg-02", true);

    queue.setFilter("needs_review");

    expect(queue.filter).toBe("needs_review");
    expect(queue.checkedSegmentIds.size).toBe(0);
  });

  it("falls back to the first visible segment when the selected segment disappears", () => {
    const queue = new CatQueueStore();
    queue.replace([...queueSegments]);
    queue.select("seg-03");

    queue.reconcileVisibleIds(new Set(["seg-01", "seg-02"]));

    expect(queue.selectedSegmentId).toBe("seg-01");
    expect([...queue.checkedSegmentIds]).toEqual([]);
  });
});

describe("CatSegmentDraft", () => {
  it("tracks dirty state from the saved baseline", () => {
    const draft = new CatSegmentDraft("seg-01", "Saved", "pending");

    expect(draft.isDirty).toBe(false);

    draft.setTargetText("Edited");
    expect(draft.isDirty).toBe(true);

    draft.markSaved("Edited", "reviewed");
    expect(draft.isDirty).toBe(false);
    expect(draft.status).toBe("reviewed");
  });

  it("applies server snapshots without leaving the draft dirty", () => {
    const draft = new CatSegmentDraft("seg-01", "Local", "pending");
    draft.setTargetText("Unsaved");

    draft.applyServerTarget("Server", "reviewed");

    expect(draft.targetText).toBe("Server");
    expect(draft.isDirty).toBe(false);
    expect(draft.status).toBe("reviewed");
  });

  it("updates status from server without changing the target baseline", () => {
    const draft = new CatSegmentDraft("seg-01", "Saved", "pending");

    draft.applyServerStatus("skipped");

    expect(draft.status).toBe("skipped");
    expect(draft.isDirty).toBe(false);
  });
});

describe("CatSegmentStore", () => {
  it("owns segment drafts independently from queue metadata", () => {
    const segments = new CatSegmentStore();
    segments.setTargetText("seg-01", "Draft", true);

    expect(segments.dirtySegmentIds.has("seg-01")).toBe(true);
    expect(segments.hasDirtySegments).toBe(true);
    expect(segments.removeIfClean("seg-01")).toBe(false);

    segments.markSaved("seg-01", "Saved", "needs_review", true);
    expect(segments.removeIfClean("seg-01")).toBe(true);
  });

  it("ignores edits for segments that are not in the queue", () => {
    const segments = new CatSegmentStore();

    segments.setTargetText("missing", "Draft", false);
    segments.setStatus("missing", "skipped", false);

    expect(segments.drafts.size).toBe(0);
  });

  it("creates a draft when setting status for an unedited queued segment", () => {
    const segments = new CatSegmentStore();

    segments.setStatus("seg-01", "skipped", true);

    expect(segments.drafts.get("seg-01")).toMatchObject({
      targetText: "",
      status: "skipped",
    });
  });

  it("clears drafts and comments", () => {
    const segments = new CatSegmentStore();
    segments.setTargetText("seg-01", "Draft", true);
    segments.comments.set("seg-01", [
      { id: "c-1", type: "comment", status: null, text: "Note", createdAt: null, locale: null },
    ]);

    segments.clear();

    expect(segments.drafts.size).toBe(0);
    expect(segments.comments.size).toBe(0);
  });

  it("clears comment errors", () => {
    const segments = new CatSegmentStore();
    segments.commentPostError = "Failed to post.";

    segments.clearCommentError();

    expect(segments.commentPostError).toBeUndefined();
  });
});

describe("CatIntelligenceStore", () => {
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

  it("keeps file-level checks unchanged when updating a non-selected segment", () => {
    const intelligence = new CatIntelligenceStore();
    intelligence.formatChecks = [
      { id: "selected-check", label: "Selected", status: "pass", message: "Visible" },
    ];

    intelligence.setChecks(
      "seg-02",
      [{ id: "other-check", label: "Other", status: "warn", message: "Hidden" }],
      false,
    );

    expect(intelligence.formatChecks[0]?.id).toBe("selected-check");
    expect(intelligence.segmentFormatChecks["seg-02"]?.[0]?.id).toBe("other-check");
  });

  it("merges segment intelligence on top of file defaults", () => {
    const intelligence = new CatIntelligenceStore();
    intelligence.fileIntelligence = {
      glossaryTerms: [],
      productMeaning: "File meaning",
      aiSuggestion: "File suggestion",
    };

    intelligence.mergeSegment("seg-01", { productMeaning: "Segment meaning" });

    expect(intelligence.bySegment["seg-01"]).toMatchObject({
      productMeaning: "Segment meaning",
      aiSuggestion: "File suggestion",
    });
  });

  it("tracks agent context reveal and lookup lifecycle", () => {
    const intelligence = new CatIntelligenceStore();

    intelligence.revealAgentContext("seg-01");
    intelligence.beginContextLookup("seg-01");
    intelligence.endContextLookup("seg-01");

    expect(intelligence.revealedAgentContextSegmentIds.has("seg-01")).toBe(true);
    expect(intelligence.contextLoadingSegmentIds.has("seg-01")).toBe(false);
  });
});

describe("CatWorkspaceUiStore", () => {
  it("tracks view mode and page limit", () => {
    const ui = new CatWorkspaceUiStore();

    ui.setViewMode("side-by-side");

    expect(ui.viewMode).toBe("side-by-side");
    expect(ui.pageLimit).toBe(20);
    expect(ui.isSideBySideView).toBe(true);
  });

  it("tracks hovered segment and preview loading state", () => {
    const ui = new CatWorkspaceUiStore();

    ui.setHoveredSegment("seg-02");
    ui.setPreviewLoadingState("seg-02", {
      isTargetLoading: true,
      isCommentsLoading: false,
    });

    expect(ui.hoveredSegmentId).toBe("seg-02");

    ui.clearHoveredSegment();

    expect(ui.hoveredSegmentId).toBeNull();
    expect(ui.previewTargetLoading).toBe(true);
  });
});
