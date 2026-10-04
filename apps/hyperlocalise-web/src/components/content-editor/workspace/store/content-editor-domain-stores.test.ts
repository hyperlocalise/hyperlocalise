/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { autorun } from "mobx";
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorIntelligenceStore } from "./content-editor-intelligence-store";
import { ContentEditorQueueStore } from "./content-editor-queue-store";
import { ContentEditorSegmentDraft } from "./content-editor-segment-draft";
import { ContentEditorSegmentStore } from "./content-editor-segment-store";
import { ContentEditorWorkspaceUiStore } from "./content-editor-workspace-ui-store";
import { ContentEditorWorkspaceOrchestrator } from "../content-editor-workspace-orchestrator";
import {
  CAT_DETAILS_PANEL_COLLAPSED_STORAGE_KEY,
  CAT_FILES_PANEL_COLLAPSED_STORAGE_KEY,
  CAT_SHORTCUT_HINTS_HIDDEN_STORAGE_KEY,
} from "../content-editor-workspace-panel-state";
import { CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY } from "../content-editor-workspace-view-mode";

const queueSegments = [
  { id: "seg-01", index: 1, key: "first", sourceText: "First" },
  { id: "seg-02", index: 2, key: "second", sourceText: "Second" },
  { id: "seg-03", index: 3, key: "third", sourceText: "Third" },
] as const;

it("does not invalidate another segment's intelligence when checks arrive", () => {
  const store = new ContentEditorIntelligenceStore();
  store.setSegment("first", { glossaryTerms: [] });
  let runs = 0;
  const dispose = autorun(() => {
    void store.bySegment.first;
    runs += 1;
  });
  store.setSegment("second", { glossaryTerms: [], aiSuggestion: "Bonjour" });
  expect(runs).toBe(1);
  dispose();
});

describe("ContentEditorQueueStore", () => {
  it("constructs without throwing when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", {});

    try {
      const queue = new ContentEditorQueueStore();
      expect(queue.selectionMode).toBe(false);
      expect(() => queue.setSelectionMode(true)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sorts segments by index", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([
      { id: "seg-03", index: 3, key: "third", sourceText: "Third" },
      { id: "seg-01", index: 1, key: "first", sourceText: "First" },
    ]);

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-03"]);
  });

  it("keeps queue selection and checked IDs within the current queue", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace(queueSegments.slice(0, 2));
    queue.select("seg-02");
    queue.selectAll(["seg-01", "seg-02"]);

    queue.replace([queueSegments[0]]);

    expect(queue.selectedSegmentId).toBe("seg-01");
    expect([...queue.checkedSegmentIds]).toEqual(["seg-01"]);
  });

  it("merges segments without dropping existing queue entries", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([queueSegments[0]]);
    queue.merge([queueSegments[1]]);

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-02"]);
  });

  it("removes a segment and its checked state", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);
    queue.toggleChecked("seg-02", true);

    queue.remove("seg-02");

    expect(queue.segments.map((segment) => segment.id)).toEqual(["seg-01", "seg-03"]);
    expect(queue.checkedSegmentIds.has("seg-02")).toBe(false);
  });

  it("clears checked segments when the filter changes", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);
    queue.toggleChecked("seg-02", true);

    queue.setFilter("needs_review");

    expect(queue.filter).toBe("needs_review");
    expect(queue.checkedSegmentIds.size).toBe(0);
  });

  it("stores queue search independently of the segment list", () => {
    const queue = new ContentEditorQueueStore();

    queue.setSearch("welcome");

    expect(queue.search).toBe("welcome");
  });

  it("clears checked segments when bulk selection mode is turned off", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);
    queue.toggleChecked("seg-02", true);

    queue.setSelectionMode(true);
    queue.setSelectionMode(false);

    expect(queue.selectionMode).toBe(false);
    expect(queue.checkedSegmentIds.size).toBe(0);
  });

  it("toggles hidden metadata on queue segments", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);

    queue.setHidden(["seg-02"], true);
    expect(queue.segments.find((segment) => segment.id === "seg-02")?.isHidden).toBe(true);

    queue.setHidden(["seg-02"], false);
    expect(queue.segments.find((segment) => segment.id === "seg-02")?.isHidden).toBeUndefined();
  });

  it("toggles locked metadata on queue segments", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);

    queue.setLocked(["seg-02"], true);
    expect(queue.segments.find((segment) => segment.id === "seg-02")?.isLocked).toBe(true);

    queue.setLocked(["seg-02"], false);
    expect(queue.segments.find((segment) => segment.id === "seg-02")?.isLocked).toBeUndefined();
  });

  it("falls back to the first visible segment when the selected segment disappears", () => {
    const queue = new ContentEditorQueueStore();
    queue.replace([...queueSegments]);
    queue.select("seg-03");

    queue.reconcileVisibleIds(new Set(["seg-01", "seg-02"]));

    expect(queue.selectedSegmentId).toBe("seg-01");
    expect([...queue.checkedSegmentIds]).toEqual([]);
  });
});

describe("ContentEditorSegmentDraft", () => {
  it("tracks dirty state from the saved baseline", () => {
    const draft = new ContentEditorSegmentDraft("seg-01", "Saved", "pending");

    expect(draft.isDirty).toBe(false);

    draft.setTargetText("Edited");
    expect(draft.isDirty).toBe(true);

    draft.markSaved("Edited", "reviewed");
    expect(draft.isDirty).toBe(false);
    expect(draft.status).toBe("reviewed");
  });

  it("applies server snapshots without leaving the draft dirty", () => {
    const draft = new ContentEditorSegmentDraft("seg-01", "Local", "pending");
    draft.setTargetText("Unsaved");

    draft.applyServerTarget("Server", "reviewed");

    expect(draft.targetText).toBe("Server");
    expect(draft.isDirty).toBe(false);
    expect(draft.status).toBe("reviewed");
  });

  it("ignores no-op server target and status updates", () => {
    const draft = new ContentEditorSegmentDraft("seg-01", "Saved", "reviewed");
    let notifications = 0;
    const dispose = autorun(() => {
      void draft.targetText;
      void draft.savedTargetText;
      void draft.status;
      notifications += 1;
    });

    notifications = 0;
    draft.applyServerTarget("Saved", "reviewed");
    draft.applyServerStatus("reviewed");

    expect(notifications).toBe(0);
    dispose();
  });

  it("updates status from server without changing the target baseline", () => {
    const draft = new ContentEditorSegmentDraft("seg-01", "Saved", "pending");

    draft.applyServerStatus("skipped");

    expect(draft.status).toBe("skipped");
    expect(draft.isDirty).toBe(false);
  });
});

describe("ContentEditorSegmentStore", () => {
  it("owns segment drafts independently from queue metadata", () => {
    const segments = new ContentEditorSegmentStore();
    segments.setTargetText("seg-01", "Draft", true);

    expect(segments.dirtySegmentIds.has("seg-01")).toBe(true);
    expect(segments.hasDirtySegments).toBe(true);
    expect(segments.removeIfClean("seg-01")).toBe(false);

    segments.markSaved("seg-01", "Saved", "needs_review", true);
    expect(segments.removeIfClean("seg-01")).toBe(true);
  });

  it("ignores edits for segments that are not in the queue", () => {
    const segments = new ContentEditorSegmentStore();

    segments.setTargetText("missing", "Draft", false);
    segments.setStatus("missing", "skipped", false);

    expect(segments.drafts.size).toBe(0);
  });

  it("creates a draft when setting status for an unedited queued segment", () => {
    const segments = new ContentEditorSegmentStore();

    segments.setStatus("seg-01", "skipped", true);

    expect(segments.drafts.get("seg-01")).toMatchObject({
      targetText: "",
      status: "skipped",
    });
  });

  it("clears drafts and comments", () => {
    const segments = new ContentEditorSegmentStore();
    segments.setTargetText("seg-01", "Draft", true);
    segments.comments.set("seg-01", [
      { id: "c-1", type: "comment", status: null, text: "Note", createdAt: null, locale: null },
    ]);

    segments.clear();

    expect(segments.drafts.size).toBe(0);
    expect(segments.comments.size).toBe(0);
  });

  it("clears comment errors", () => {
    const segments = new ContentEditorSegmentStore();
    segments.commentPostError = "Failed to post.";

    segments.clearCommentError();

    expect(segments.commentPostError).toBeUndefined();
  });
});

describe("ContentEditorIntelligenceStore", () => {
  it("owns segment intelligence and selected checks", () => {
    const intelligence = new ContentEditorIntelligenceStore();
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
    const intelligence = new ContentEditorIntelligenceStore();
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
    const intelligence = new ContentEditorIntelligenceStore();
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
    const intelligence = new ContentEditorIntelligenceStore();

    intelligence.revealAgentContext("seg-01");
    intelligence.beginContextLookup("seg-01");
    intelligence.endContextLookup("seg-01");

    expect(intelligence.revealedAgentContextSegmentIds.has("seg-01")).toBe(true);
    expect(intelligence.contextLoadingSegmentIds.has("seg-01")).toBe(false);
  });
});

describe("ContentEditorWorkspaceUiStore", () => {
  it("opens one toolbar dialog at a time and keeps the export format across openings", () => {
    const ui = new ContentEditorWorkspaceUiStore();

    expect(ui.chromeDialog).toBeNull();
    expect(ui.exportFormat).toBe("csv");

    ui.openChromeDialog("export");
    ui.setExportFormat("xliff");
    ui.openChromeDialog("shortcuts");
    expect(ui.chromeDialog).toBe("shortcuts");

    ui.closeChromeDialog();
    ui.openChromeDialog("export");
    expect(ui.chromeDialog).toBe("export");
    expect(ui.exportFormat).toBe("xliff");
  });

  it("persists the shortcut hint preference", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore("comfortable");
      expect(ui.shortcutHintsHidden).toBe(false);

      ui.setShortcutHintsHidden(true);

      expect(store.get(CAT_SHORTCUT_HINTS_HIDDEN_STORAGE_KEY)).toBe("true");
      expect(new ContentEditorWorkspaceUiStore("comfortable").shortcutHintsHidden).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tracks view mode and page limit", () => {
    const ui = new ContentEditorWorkspaceUiStore();

    ui.setViewMode("side-by-side");

    expect(ui.viewMode).toBe("side-by-side");
    expect(ui.pageLimit).toBe(20);
    expect(ui.isSideBySideView).toBe(true);
    expect(ui.isFileView).toBe(false);

    ui.setSideBySideViewport({
      visibleSegmentIds: ["seg-01"],
      loadSegmentIds: ["seg-01", "seg-02"],
    });

    ui.setViewMode("file");

    expect(ui.isFileView).toBe(true);
    expect(ui.pageLimit).toBe(50);
    expect(ui.visibleSideBySideSegmentIds).toEqual([]);
    expect(ui.loadSideBySideSegmentIds).toEqual([]);
  });

  it("honors an explicit initial view mode without reading the stored view mode", () => {
    const getItem = vi.fn().mockReturnValue("side-by-side");
    vi.stubGlobal("localStorage", { getItem, setItem: vi.fn() });

    try {
      const ui = new ContentEditorWorkspaceUiStore("comfortable");

      expect(ui.viewMode).toBe("comfortable");
      expect(ui.isSideBySideView).toBe(false);
      expect(getItem).not.toHaveBeenCalledWith(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists files and details panel collapse state", () => {
    const store = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => store.set(key, value));
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem });

    try {
      const ui = new ContentEditorWorkspaceUiStore("comfortable");

      expect(ui.filesPanelCollapsed).toBe(false);
      expect(ui.detailsPanelCollapsed).toBe(false);

      ui.toggleFilesPanel();
      ui.toggleDetailsPanel();

      expect(ui.filesPanelCollapsed).toBe(true);
      expect(ui.detailsPanelCollapsed).toBe(true);
      expect(setItem).toHaveBeenCalledWith(CAT_FILES_PANEL_COLLAPSED_STORAGE_KEY, "true");
      expect(setItem).toHaveBeenCalledWith(CAT_DETAILS_PANEL_COLLAPSED_STORAGE_KEY, "true");

      expect(new ContentEditorWorkspaceUiStore("comfortable").filesPanelCollapsed).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("expands the details panel when QA details are revealed", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });

    try {
      const ui = new ContentEditorWorkspaceUiStore("side-by-side");
      ui.setDetailsPanelCollapsed(true);

      ui.revealQaDetails();

      expect(ui.detailsPanelCollapsed).toBe(false);
      expect(ui.qaDetailsRevealNonce).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips persistence when collapse state is applied transiently", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });

    try {
      const ui = new ContentEditorWorkspaceUiStore("comfortable");
      ui.setFilesPanelCollapsed(true, { persist: false });

      expect(ui.filesPanelCollapsed).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not persist view mode changes when initialViewMode was set", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });

    try {
      const ui = new ContentEditorWorkspaceUiStore("comfortable");
      ui.setViewMode("side-by-side");

      expect(ui.viewMode).toBe("side-by-side");
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reveals QA details through a store signal instead of a window event", () => {
    const ui = new ContentEditorWorkspaceUiStore();

    expect(ui.qaDetailsRevealNonce).toBe(0);

    ui.revealQaDetails();
    ui.revealQaDetails();

    expect(ui.qaDetailsRevealNonce).toBe(2);
  });

  it("tracks the virtualized side-by-side viewport and load range", () => {
    const ui = new ContentEditorWorkspaceUiStore();

    ui.setSideBySideViewport({
      visibleSegmentIds: ["seg-01", "seg-02"],
      loadSegmentIds: ["seg-01", "seg-02", "seg-03"],
    });

    expect(ui.visibleSideBySideSegmentIds).toEqual(["seg-01", "seg-02"]);
    expect(ui.loadSideBySideSegmentIds).toEqual(["seg-01", "seg-02", "seg-03"]);

    ui.setSideBySideViewport({ visibleSegmentIds: [], loadSegmentIds: [] });

    expect(ui.visibleSideBySideSegmentIds).toEqual([]);
    expect(ui.loadSideBySideSegmentIds).toEqual([]);
  });

  it("loads saved persona on initial text family hydration without early returning", () => {
    const getItem = vi.fn().mockImplementation((key: string) => {
      if (key === "content-editor-workspace-persona:v1:text") {
        return "reviewer";
      }
      return null;
    });
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.applyFileFamily("text");

      expect(ui.workspacePersona).toBe("reviewer");
      expect(ui.resolvedPersona).toBe("reviewer");
      expect(ui.isReviewerPersona).toBe(true);
      expect(ui.viewMode).toBe("side-by-side");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drives corresponding layout preset when selecting a persona", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn().mockReturnValue(null), setItem },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);

      ui.setWorkspacePersona("reviewer");
      expect(ui.resolvedPersona).toBe("reviewer");
      expect(ui.isReviewerPersona).toBe(true);
      expect(ui.viewMode).toBe("side-by-side");

      ui.setWorkspacePersona("translator");
      expect(ui.resolvedPersona).toBe("translator");
      expect(ui.isTranslatorPersona).toBe(true);
      expect(ui.viewMode).toBe("comfortable");

      ui.setWorkspacePersona("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.isDesignerPersona).toBe(true);
      expect(ui.viewMode).toBe("file");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("synchronizes workspacePersona when setViewMode is called under adaptive mode", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn().mockReturnValue(null), setItem },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.applyFileFamily("text");

      // Default for text is translator
      expect(ui.resolvedPersona).toBe("translator");

      // Selecting side-by-side view synchronizes persona to reviewer
      ui.setViewMode("side-by-side");
      expect(ui.workspacePersona).toBe("reviewer");
      expect(ui.resolvedPersona).toBe("reviewer");
      expect(ui.isReviewerPersona).toBe(true);
      expect(setItem).toHaveBeenCalledWith("content-editor-workspace-persona:v1:text", "reviewer");

      // Selecting comfortable view synchronizes persona to translator
      ui.setViewMode("comfortable");
      expect(ui.workspacePersona).toBe("translator");
      expect(ui.resolvedPersona).toBe("translator");
      expect(ui.isTranslatorPersona).toBe(true);
      expect(setItem).toHaveBeenCalledWith(
        "content-editor-workspace-persona:v1:text",
        "translator",
      );

      // Selecting file view synchronizes persona to designer
      ui.setViewMode("file");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.isDesignerPersona).toBe(true);
      expect(setItem).toHaveBeenCalledWith("content-editor-workspace-persona:v1:text", "designer");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not mutate workspacePersona when adaptive mode is disabled", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn().mockReturnValue(null), setItem },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(false);
      ui.applyFileFamily("text");

      ui.setViewMode("side-by-side");
      expect(ui.workspacePersona).toBeNull();
      expect(setItem).not.toHaveBeenCalledWith(
        "content-editor-workspace-persona:v1:text",
        "reviewer",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps designer persona when adaptive view mode switches away from file on designer families", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => store.set(key, value)),
      },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.applyFileFamily("image");
      // Applying a designer family runs file-view sync, which materializes the designer persona.
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.viewMode).toBe("file");
      expect(store.get("content-editor-workspace-persona:v1:image")).toBe("designer");

      // Text families map side-by-side → reviewer and comfortable → translator.
      // Designer families must keep the designer persona so image/video layout stays intact.
      ui.setViewMode("side-by-side");
      expect(ui.viewMode).toBe("side-by-side");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(store.get("content-editor-workspace-persona:v1:image")).toBe("designer");

      ui.setViewMode("comfortable");
      expect(ui.viewMode).toBe("comfortable");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(store.get("content-editor-workspace-persona:v1:image")).toBe("designer");

      ui.setViewMode("file");
      expect(ui.viewMode).toBe("file");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(store.get("content-editor-workspace-persona:v1:image")).toBe("designer");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("isolates saved persona preferences between distinct file families", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, val: string) => store.set(key, val)),
      },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);

      // Start on text family and save reviewer
      ui.applyFileFamily("text");
      ui.setWorkspacePersona("reviewer", "text");
      expect(ui.workspacePersona).toBe("reviewer");
      expect(ui.viewMode).toBe("side-by-side");
      expect(store.get("content-editor-workspace-persona:v1:text")).toBe("reviewer");

      // Switch to image family
      ui.applyFileFamily("image");
      // Image has no saved preference yet, defaults to designer
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.viewMode).toBe("file");

      // Save designer for image family
      ui.setWorkspacePersona("designer", "image");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.viewMode).toBe("file");
      expect(store.get("content-editor-workspace-persona:v1:image")).toBe("designer");

      // Text preference should still be reviewer
      expect(store.get("content-editor-workspace-persona:v1:text")).toBe("reviewer");

      // Switch back to text family: restores reviewer persona and side-by-side view
      ui.applyFileFamily("text");
      expect(ui.workspacePersona).toBe("reviewer");
      expect(ui.resolvedPersona).toBe("reviewer");
      expect(ui.viewMode).toBe("side-by-side");

      // Switch back to image family: restores designer persona and file view
      ui.applyFileFamily("image");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.viewMode).toBe("file");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("restores saved translator preference when switching from an image file back to a text file", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, val: string) => store.set(key, val)),
      },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);

      // Start on text family and save translator
      ui.applyFileFamily("text");
      ui.setWorkspacePersona("translator", "text");
      expect(ui.workspacePersona).toBe("translator");
      expect(ui.viewMode).toBe("comfortable");
      expect(store.get("content-editor-workspace-persona:v1:text")).toBe("translator");

      // Switch to image family (layout becomes file view, persona becomes designer)
      ui.applyFileFamily("image");
      expect(ui.workspacePersona).toBe("designer");
      expect(ui.resolvedPersona).toBe("designer");
      expect(ui.viewMode).toBe("file");

      // Switch back to text family: restores saved translator persona and comfortable view
      ui.applyFileFamily("text");
      expect(ui.workspacePersona).toBe("translator");
      expect(ui.resolvedPersona).toBe("translator");
      expect(ui.viewMode).toBe("comfortable");
      expect(store.get("content-editor-workspace-persona:v1:text")).toBe("translator");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves legacy view-mode preference in localStorage when adaptive mode is enabled", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => {
          if (key === "content-editor-workspace-view-mode:v1") return "side-by-side";
          return null;
        }),
        setItem,
      },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.applyFileFamily("text");

      // Default persona is translator, layout becomes comfortable
      expect(ui.viewMode).toBe("comfortable");
      expect(ui.resolvedPersona).toBe("translator");

      // writeCatWorkspaceViewMode should NOT have been called with "comfortable"
      expect(setItem).not.toHaveBeenCalledWith(
        "content-editor-workspace-view-mode:v1",
        "comfortable",
      );

      // Switching persona to reviewer should also not overwrite the legacy view-mode key
      ui.setWorkspacePersona("reviewer", "text");
      expect(ui.viewMode).toBe("side-by-side");
      expect(setItem).not.toHaveBeenCalledWith(
        "content-editor-workspace-view-mode:v1",
        "side-by-side",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("saves and preserves multilingual view choice in adaptive workspace without overwriting on file family apply", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
    });

    try {
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.setMultilingualViewAvailable(true);
      ui.applyFileFamily("text");

      // User selects multilingual in view switcher
      ui.setViewMode("multilingual");
      expect(ui.viewMode).toBe("multilingual");
      // Multilingual choice is saved to localStorage
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("multilingual");

      // Navigating to an image segment in a mixed-file workspace applies designer layout (file view)
      ui.applyFileFamily("image");
      expect(ui.viewMode).toBe("file");
      // The automatic switch to file view must NOT overwrite the stored multilingual preference
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("multilingual");

      // Returning to a text segment restores the user's chosen multilingual view
      ui.applyFileFamily("text");
      expect(ui.viewMode).toBe("multilingual");

      // Reopening workspace (new instance reading stored viewMode)
      const reopenedUi = new ContentEditorWorkspaceUiStore();
      expect(reopenedUi.viewMode).toBe("multilingual");
      reopenedUi.setAdaptiveWorkspaceEnabled(true);
      reopenedUi.setMultilingualViewAvailable(true);
      // Applying file family must preserve multilingual layout instead of overriding with translator persona
      reopenedUi.applyFileFamily("text");
      expect(reopenedUi.viewMode).toBe("multilingual");

      // Explicitly selecting another view mode updates the saved preference
      reopenedUi.setViewMode("comfortable");
      expect(reopenedUi.viewMode).toBe("comfortable");
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("comfortable");

      // Switching to image and back to text now restores the persona preference (comfortable), not multilingual
      reopenedUi.applyFileFamily("image");
      expect(reopenedUi.viewMode).toBe("file");
      reopenedUi.applyFileFamily("text");
      expect(reopenedUi.viewMode).toBe("comfortable");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not restore multilingual when multilingualViewAvailable is false and preserves stored preference", () => {
    const storage = new Map<string, string>([
      ["content-editor-workspace-view-mode:v1", "multilingual"],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
    });

    try {
      // Workspace has no multilingual configuration
      const ui = new ContentEditorWorkspaceUiStore();
      ui.setAdaptiveWorkspaceEnabled(true);
      ui.setMultilingualViewAvailable(false);

      // Navigating to an image file in mixed workspace
      ui.applyFileFamily("image");
      expect(ui.viewMode).toBe("file");
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("multilingual");

      // Moving to a text segment: since multilingual is unavailable, it falls back to persona layout
      // and does NOT attempt to set multilingual or overwrite the stored preference in localStorage
      ui.applyFileFamily("text");
      expect(ui.viewMode).toBe("comfortable");
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("multilingual");

      // When view-mode sync clamps with { persistViewMode: false }, the stored preference is also preserved
      ui.setViewMode("side-by-side", { persistViewMode: false });
      expect(ui.viewMode).toBe("side-by-side");
      expect(storage.get("content-editor-workspace-view-mode:v1")).toBe("multilingual");

      // Opening another workspace where multilingual IS available restores the choice
      const multiUi = new ContentEditorWorkspaceUiStore();
      multiUi.setAdaptiveWorkspaceEnabled(true);
      multiUi.setMultilingualViewAvailable(true);
      multiUi.applyFileFamily("text");
      expect(multiUi.viewMode).toBe("multilingual");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not persist selectionMode to localStorage when adaptiveWorkspaceEnabled is true and clears on translator switch", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
    });

    try {
      const orchestrator = new ContentEditorWorkspaceOrchestrator();
      orchestrator.ui.setAdaptiveWorkspaceEnabled(true);

      // In adaptive workspace, orchestrator.setSelectionMode defaults to persist: false
      orchestrator.setSelectionMode(true);
      expect(orchestrator.queue.selectionMode).toBe(true);
      expect(storage.get("content-editor-queue:selection-mode:v1")).toBeUndefined();

      // Check some segments
      orchestrator.queue.toggleChecked("seg-1", true);
      orchestrator.queue.toggleChecked("seg-2", true);
      expect(orchestrator.queue.checkedSegmentIds.size).toBe(2);

      // Switching off selection mode clears checked segments without writing to localStorage
      orchestrator.setSelectionMode(false);
      expect(orchestrator.queue.selectionMode).toBe(false);
      expect(orchestrator.queue.checkedSegmentIds.size).toBe(0);
      expect(storage.get("content-editor-queue:selection-mode:v1")).toBeUndefined();

      // Outside adaptive mode, setting selection mode DOES persist to localStorage
      orchestrator.ui.setAdaptiveWorkspaceEnabled(false);
      orchestrator.setSelectionMode(true);
      expect(storage.get("content-editor-queue:selection-mode:v1")).toBe("true");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
