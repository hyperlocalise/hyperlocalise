import { makeAutoObservable } from "mobx";

import {
  catPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type CatWorkspaceViewMode,
} from "@/components/cat/workspace/cat-workspace-view-mode";

export class CatWorkspaceUiStore {
  viewMode: CatWorkspaceViewMode;
  hoveredSegmentId: string | null = null;
  previewLoadingSegmentId: string | null = null;
  previewTargetLoading = false;
  previewCommentsLoading = false;
  visibleSideBySideSegmentIds: string[] = [];
  // Explicit initial modes (e.g. marketing demos) must not overwrite the
  // visitor's real CAT workspace preference.
  #persistViewMode: boolean;

  constructor(initialViewMode?: CatWorkspaceViewMode) {
    this.viewMode = initialViewMode ?? readCatWorkspaceViewMode();
    this.#persistViewMode = initialViewMode === undefined;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get pageLimit() {
    return catPageLimitForViewMode(this.viewMode);
  }

  get isSideBySideView() {
    return this.viewMode === "side-by-side";
  }

  setViewMode(mode: CatWorkspaceViewMode) {
    this.viewMode = mode;
    if (this.#persistViewMode) {
      writeCatWorkspaceViewMode(mode);
    }
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
}
