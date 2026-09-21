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

export type SideBySideVirtualItem = {
  index: number;
  start: number;
  end: number;
};

export type SideBySideViewportRange = {
  /** Rows that intersect the scrollport. Used for QA after the target hydrates. */
  visibleSegmentIds: string[];
  /** Rendered rows, including virtualizer overscan. Used to fetch translations. */
  loadSegmentIds: string[];
};

function segmentIdAt(
  segments: ReadonlyArray<{ id: string } | undefined>,
  index: number,
): string | undefined {
  const segment = segments[index];
  return segment?.id;
}

function uniqueSegmentIds(
  items: readonly SideBySideVirtualItem[],
  segments: ReadonlyArray<{ id: string } | undefined>,
  predicate?: (item: SideBySideVirtualItem) => boolean,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (predicate && !predicate(item)) {
      continue;
    }

    const segmentId = segmentIdAt(segments, item.index);
    if (!segmentId || seen.has(segmentId)) {
      continue;
    }

    seen.add(segmentId);
    ids.push(segmentId);
  }

  return ids;
}

export function itemIntersectsViewport(
  item: SideBySideVirtualItem,
  scrollOffset: number,
  viewportHeight: number,
): boolean {
  if (viewportHeight <= 0) {
    return true;
  }

  return item.end > scrollOffset && item.start < scrollOffset + viewportHeight;
}

export function partitionSideBySideVirtualItems(input: {
  items: readonly SideBySideVirtualItem[];
  segments: ReadonlyArray<{ id: string } | undefined>;
  scrollOffset: number;
  viewportHeight: number;
}): SideBySideViewportRange {
  const loadSegmentIds = uniqueSegmentIds(input.items, input.segments);
  const visibleSegmentIds = uniqueSegmentIds(input.items, input.segments, (item) =>
    itemIntersectsViewport(item, input.scrollOffset, input.viewportHeight),
  );

  return { visibleSegmentIds, loadSegmentIds };
}

export function sameSegmentIdList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segmentId, index) => segmentId === right[index]);
}
