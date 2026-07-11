import { makeAutoObservable } from "mobx";

import {
  catPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type CatWorkspaceViewMode,
} from "@/components/cat/workspace/cat-workspace-view-mode";

export class CatWorkspaceUiStore {
  viewMode: CatWorkspaceViewMode = readCatWorkspaceViewMode();
  hoveredSegmentId: string | null = null;
  previewLoadingSegmentId: string | null = null;
  previewTargetLoading = false;
  previewCommentsLoading = false;
  visibleSideBySideSegmentIds: string[] = [];

  constructor() {
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
    writeCatWorkspaceViewMode(mode);
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
