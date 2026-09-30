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
import { makeAutoObservable } from "mobx";

import {
  contentEditorPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type ContentEditorWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";
import {
  defaultPersonaForFileFamily,
  readCatWorkspacePersona,
  writeCatWorkspacePersona,
  type ContentEditorWorkspacePersona,
} from "@/components/content-editor/workspace/content-editor-workspace-persona";

export class ContentEditorWorkspaceUiStore {
  viewMode: ContentEditorWorkspaceViewMode;
  hoveredSegmentId: string | null = null;
  previewLoadingSegmentId: string | null = null;
  previewTargetLoading = false;
  previewCommentsLoading = false;
  /** True while the translation/editor pane is waiting for a new file snapshot. */
  translationViewLoading = false;
  visibleSideBySideSegmentIds: string[] = [];
  // Explicit initial modes (e.g. marketing demos) must not overwrite the
  // visitor's real CAT workspace preference.
  #persistViewMode: boolean;

  /**
   * Current workspace persona. Stored per-file-family so switching between
   * an image file and a string file remembers a separate preference for each.
   * Null means the persona has not been resolved yet for the current file family.
   */
  workspacePersona: ContentEditorWorkspacePersona | null = null;

  /** File family used to scope persona persistence (e.g. "image", "text"). */
  #currentFileFamily: string = "text";

  constructor(initialViewMode?: ContentEditorWorkspaceViewMode) {
    this.viewMode = initialViewMode ?? readCatWorkspaceViewMode();
    this.#persistViewMode = initialViewMode === undefined;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get pageLimit() {
    return contentEditorPageLimitForViewMode(this.viewMode);
  }

  get isSideBySideView() {
    return this.viewMode === "side-by-side";
  }

  get isFileView() {
    return this.viewMode === "file";
  }

  get resolvedPersona(): ContentEditorWorkspacePersona {
    return this.workspacePersona ?? defaultPersonaForFileFamily(this.#currentFileFamily);
  }

  get isDesignerPersona(): boolean {
    return this.resolvedPersona === "designer";
  }

  get isReviewerPersona(): boolean {
    return this.resolvedPersona === "reviewer";
  }

  get isTranslatorPersona(): boolean {
    return this.resolvedPersona === "translator";
  }

  setViewMode(mode: ContentEditorWorkspaceViewMode) {
    this.viewMode = mode;
    if (this.#persistViewMode) {
      writeCatWorkspaceViewMode(mode);
    }
  }

  /**
   * Called when the active file family changes (e.g. switching from a string
   * file to an image file). Loads the stored persona preference for the new
   * family, falling back to the auto-detected default.
   */
  applyFileFamily(fileFamily: string) {
    if (this.#currentFileFamily === fileFamily) {
      return;
    }

    this.#currentFileFamily = fileFamily;
    const stored = readCatWorkspacePersona(fileFamily);
    this.workspacePersona = stored;
  }

  /**
   * Explicitly set the workspace persona. Persists the choice under the
   * current file family so it is restored on future visits.
   */
  setWorkspacePersona(persona: ContentEditorWorkspacePersona) {
    this.workspacePersona = persona;
    writeCatWorkspacePersona(this.#currentFileFamily, persona);
  }

  setHoveredSegment(segmentId: string | null) {
    this.hoveredSegmentId = segmentId;
  }

  clearHoveredSegment() {
    this.hoveredSegmentId = null;
  }

  setVisibleSideBySideSegmentIds(segmentIds: string[]) {
    if (
      this.visibleSideBySideSegmentIds.length === segmentIds.length &&
      this.visibleSideBySideSegmentIds.every((segmentId, index) => segmentId === segmentIds[index])
    ) {
      return;
    }

    this.visibleSideBySideSegmentIds = segmentIds;
  }

  setPreviewLoadingState(
    segmentId: string | null,
    state: { isTargetLoading: boolean; isCommentsLoading: boolean },
  ) {
    this.previewLoadingSegmentId = segmentId;
    this.previewTargetLoading = state.isTargetLoading;
    this.previewCommentsLoading = state.isCommentsLoading;
  }

  setTranslationViewLoading(loading: boolean) {
    this.translationViewLoading = loading;
  }
}
