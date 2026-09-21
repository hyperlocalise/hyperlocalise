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

import { sameSegmentIdList } from "@/components/content-editor/side-by-side/content-editor-side-by-side-visible-range";
import {
  contentEditorPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type ContentEditorWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

export class ContentEditorWorkspaceUiStore {
  viewMode: ContentEditorWorkspaceViewMode;
  /** True while the translation/editor pane is waiting for a new file snapshot. */
  translationViewLoading = false;
  /** Rows intersecting the side-by-side scrollport. Used for QA after hydration. */
  visibleSideBySideSegmentIds: string[] = [];
  /** Rendered side-by-side rows, including overscan. Used to fetch translations. */
  loadSideBySideSegmentIds: string[] = [];
  // Explicit initial modes (e.g. marketing demos) must not overwrite the
  // visitor's real CAT workspace preference.
  #persistViewMode: boolean;

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

  setViewMode(mode: ContentEditorWorkspaceViewMode) {
    this.viewMode = mode;
    if (this.#persistViewMode) {
      writeCatWorkspaceViewMode(mode);
    }
    if (mode !== "side-by-side") {
      this.setSideBySideViewport({ visibleSegmentIds: [], loadSegmentIds: [] });
    }
  }

  setSideBySideViewport(input: { visibleSegmentIds: string[]; loadSegmentIds: string[] }) {
    const visibleUnchanged = sameSegmentIdList(
      this.visibleSideBySideSegmentIds,
      input.visibleSegmentIds,
    );
    const loadUnchanged = sameSegmentIdList(this.loadSideBySideSegmentIds, input.loadSegmentIds);
    if (visibleUnchanged && loadUnchanged) {
      return;
    }

    if (!visibleUnchanged) {
      this.visibleSideBySideSegmentIds = input.visibleSegmentIds;
    }
    if (!loadUnchanged) {
      this.loadSideBySideSegmentIds = input.loadSegmentIds;
    }
  }

  setTranslationViewLoading(loading: boolean) {
    this.translationViewLoading = loading;
  }
}
