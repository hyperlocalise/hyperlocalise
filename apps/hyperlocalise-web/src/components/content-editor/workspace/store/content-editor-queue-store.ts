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
  /** The last tick box clicked: where a Shift-click range starts. */
  checkAnchorId: string | null = null;
  segmentMeta = new Map<string, ContentEditorQueueSegment>();
  /**
   * Ids in the server's current queue page. With lazily loaded targets the store also
   * retains rows outside it (selected or dirty), which the queue must not list.
   */
  windowIds: ReadonlySet<string> | undefined = undefined;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** Drops everything that belonged to the previous file or locale. */
  resetForFileScope() {
    this.segmentMeta.clear();
    this.clearChecked();
    this.selectedSegmentId = "";
    this.windowIds = undefined;
  }

  upsert(segment: ContentEditorQueueSegment) {
    this.segmentMeta.set(segment.id, segment);
  }

  setWindow(segmentIds: ReadonlySet<string> | undefined) {
    this.windowIds = segmentIds;
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

  setSelectionMode(enabled: boolean, options?: { persist?: boolean }) {
    this.selectionMode = enabled;
    if (options?.persist ?? true) {
      writeCatQueueSelectionModePreference(enabled);
    }
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

  /**
   * A click on a string's tick box. On Shift-click (`rangeIds`, the list's rows in the order shown)
   * every row from the last box clicked to this one takes the clicked box's new state, as in Gmail;
   * without an earlier click still in the list it ticks just this one. The clicked box becomes the
   * start of the next range either way.
   */
  checkFromClick(segmentId: string, checked: boolean, rangeIds?: readonly string[]) {
    const from = rangeIds && this.checkAnchorId ? rangeIds.indexOf(this.checkAnchorId) : -1;
    const to = rangeIds ? rangeIds.indexOf(segmentId) : -1;
    const segmentIds =
      rangeIds && from >= 0 && to >= 0
        ? rangeIds.slice(Math.min(from, to), Math.max(from, to) + 1)
        : [segmentId];
    for (const id of segmentIds) {
      this.toggleChecked(id, checked);
    }
    this.checkAnchorId = segmentId;
  }

  selectAll(segmentIds: string[]) {
    this.checkedSegmentIds = new Set(segmentIds);
  }

  clearChecked() {
    this.checkedSegmentIds.clear();
    this.checkAnchorId = null;
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
