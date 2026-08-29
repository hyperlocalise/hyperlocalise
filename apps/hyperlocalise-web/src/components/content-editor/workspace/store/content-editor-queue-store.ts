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

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import {
  readCatQueueSelectionModePreference,
  writeCatQueueSelectionModePreference,
} from "@/components/content-editor/queue/use-content-editor-queue-selection-mode";
import type { ContentEditorQueueSegment } from "@/components/content-editor/shared/types";

export class ContentEditorQueueStore {
  selectedSegmentId = "";
  filter: ContentEditorQueueFilter = "all";
  sort: ContentEditorQueueSort = "file_order";
  search = "";
  selectionMode = readCatQueueSelectionModePreference();
  checkedSegmentIds = new Set<string>();
  segmentMeta = new Map<string, ContentEditorQueueSegment>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get segments(): ContentEditorQueueSegment[] {
    return [...this.segmentMeta.values()].sort((left, right) => left.index - right.index);
  }

  replace(segments: ContentEditorQueueSegment[]) {
    this.segmentMeta = new Map(segments.map((segment) => [segment.id, segment]));
    this.reconcileVisibleIds(new Set(segments.map((segment) => segment.id)));
  }

  merge(segments: ContentEditorQueueSegment[]) {
    for (const segment of segments) {
      this.segmentMeta.set(segment.id, segment);
    }
    this.reconcileVisibleIds(new Set(this.segmentMeta.keys()));
  }

  remove(segmentId: string) {
    this.segmentMeta.delete(segmentId);
    this.checkedSegmentIds.delete(segmentId);
  }

  select(segmentId: string) {
    this.selectedSegmentId = segmentId;
  }

  setFilter(filter: ContentEditorQueueFilter) {
    this.filter = filter;
    this.clearChecked();
  }

  setSort(sort: ContentEditorQueueSort) {
    this.sort = sort;
    this.clearChecked();
  }

  setSearch(search: string) {
    this.search = search;
  }

  setSelectionMode(enabled: boolean) {
    this.selectionMode = enabled;
    writeCatQueueSelectionModePreference(enabled);
    if (!enabled) {
      this.clearChecked();
    }
  }

  toggleChecked(segmentId: string, checked: boolean) {
    if (checked) {
      this.checkedSegmentIds.add(segmentId);
    } else {
      this.checkedSegmentIds.delete(segmentId);
    }
  }

  selectAll(segmentIds: string[]) {
    this.checkedSegmentIds = new Set(segmentIds);
  }

  clearChecked() {
    this.checkedSegmentIds.clear();
  }

  setHidden(segmentIds: string[], isHidden: boolean) {
    for (const segmentId of segmentIds) {
      const existing = this.segmentMeta.get(segmentId);
      if (!existing) {
        continue;
      }

      if (isHidden) {
        this.segmentMeta.set(segmentId, { ...existing, isHidden: true });
        continue;
      }

      const { isHidden: _ignored, ...rest } = existing;
      this.segmentMeta.set(segmentId, rest);
    }
  }

  setLocked(segmentIds: string[], isLocked: boolean) {
    for (const segmentId of segmentIds) {
      const existing = this.segmentMeta.get(segmentId);
      if (!existing) {
        continue;
      }

      if (isLocked) {
        this.segmentMeta.set(segmentId, { ...existing, isLocked: true });
        continue;
      }

      const { isLocked: _ignored, ...rest } = existing;
      this.segmentMeta.set(segmentId, rest);
    }
  }

  reconcileVisibleIds(visibleIds: ReadonlySet<string>) {
    this.checkedSegmentIds = new Set(
      [...this.checkedSegmentIds].filter((segmentId) => visibleIds.has(segmentId)),
    );
    if (this.selectedSegmentId && !visibleIds.has(this.selectedSegmentId)) {
      this.selectedSegmentId =
        this.segments.find((segment) => visibleIds.has(segment.id))?.id ?? "";
    }
  }
}
