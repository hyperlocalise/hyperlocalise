import { makeAutoObservable } from "mobx";

import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import type { CatQueueSegment } from "@/components/cat/shared/types";

export class CatQueueStore {
  selectedSegmentId = "";
  filter: CatQueueFilter = "all";
  checkedSegmentIds = new Set<string>();
  segmentMeta = new Map<string, CatQueueSegment>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get segments(): CatQueueSegment[] {
    return [...this.segmentMeta.values()].sort((left, right) => left.index - right.index);
  }

  replace(segments: CatQueueSegment[]) {
    this.segmentMeta = new Map(segments.map((segment) => [segment.id, segment]));
    this.reconcileVisibleIds(new Set(segments.map((segment) => segment.id)));
  }

  merge(segments: CatQueueSegment[]) {
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

  setFilter(filter: CatQueueFilter) {
    this.filter = filter;
    this.clearChecked();
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
