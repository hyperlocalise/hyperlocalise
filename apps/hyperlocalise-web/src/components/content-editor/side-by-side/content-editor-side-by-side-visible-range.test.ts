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
import { describe, expect, it } from "vite-plus/test";

import {
  itemIntersectsViewport,
  partitionSideBySideVirtualItems,
  sameSegmentIdList,
} from "./content-editor-side-by-side-visible-range";

const ROW = 72;
const segments = [
  { id: "seg-00" },
  { id: "seg-01" },
  { id: "seg-02" },
  { id: "seg-03" },
  { id: "seg-04" },
  { id: "seg-05" },
];

function items(indexes: number[]) {
  return indexes.map((index) => ({
    index,
    start: index * ROW,
    end: (index + 1) * ROW,
  }));
}

describe("partitionSideBySideVirtualItems", () => {
  it("loads overscan rows but only treats intersecting rows as visible", () => {
    const range = partitionSideBySideVirtualItems({
      items: items([0, 1, 2, 3, 4, 5]),
      segments,
      scrollOffset: ROW,
      viewportHeight: ROW * 2,
    });

    expect(range.loadSegmentIds).toEqual([
      "seg-00",
      "seg-01",
      "seg-02",
      "seg-03",
      "seg-04",
      "seg-05",
    ]);
    expect(range.visibleSegmentIds).toEqual(["seg-01", "seg-02"]);
  });

  it("treats every rendered row as visible before the viewport is measured", () => {
    const range = partitionSideBySideVirtualItems({
      items: items([0, 1, 2]),
      segments,
      scrollOffset: 0,
      viewportHeight: 0,
    });

    expect(range.visibleSegmentIds).toEqual(["seg-00", "seg-01", "seg-02"]);
    expect(range.loadSegmentIds).toEqual(["seg-00", "seg-01", "seg-02"]);
  });

  it("skips missing segment indexes", () => {
    const range = partitionSideBySideVirtualItems({
      items: items([0, 8, 1]),
      segments,
      scrollOffset: 0,
      viewportHeight: ROW * 8,
    });

    expect(range.loadSegmentIds).toEqual(["seg-00", "seg-01"]);
    expect(range.visibleSegmentIds).toEqual(["seg-00", "seg-01"]);
  });
});

describe("itemIntersectsViewport", () => {
  it("counts a row that only partially overlaps the scrollport", () => {
    expect(
      itemIntersectsViewport({ index: 1, start: 72, end: 144 }, 100, 80),
    ).toBe(true);
    expect(itemIntersectsViewport({ index: 0, start: 0, end: 72 }, 72, 80)).toBe(false);
    expect(itemIntersectsViewport({ index: 2, start: 144, end: 216 }, 100, 44)).toBe(false);
  });
});

describe("sameSegmentIdList", () => {
  it("compares lists by order and identity", () => {
    expect(sameSegmentIdList(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSegmentIdList(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSegmentIdList(["a"], ["a", "b"])).toBe(false);
  });
});
