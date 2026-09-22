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
// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { contentEditorSegmentsFixture } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorSideBySideVirtualList } from "./content-editor-side-by-side-virtual-list";

const ROW_HEIGHT = 72;

type MockVirtualItem = {
  index: number;
  start: number;
  end: number;
  size: number;
  key: number;
  lane: number;
};

type MockVirtualizer = {
  getVirtualItems: () => MockVirtualItem[];
  getTotalSize: () => number;
  scrollToIndex: (index: number, options: { align: string }) => void;
  measureElement: () => undefined;
  scrollOffset: number;
  scrollRect: { height: number };
  getScrollElement: () => HTMLElement | null;
};

let virtualItems: MockVirtualItem[] = [];
let virtualizerCount = 0;
let onVirtualizerChange: ((instance: MockVirtualizer) => void) | undefined;

function makeVirtualItems(indexes: number[]) {
  return indexes.map((index) => ({
    index,
    start: index * ROW_HEIGHT,
    end: (index + 1) * ROW_HEIGHT,
    size: ROW_HEIGHT,
    key: index,
    lane: 0,
  }));
}

const virtualizer: MockVirtualizer = {
  getVirtualItems: () => virtualItems,
  getTotalSize: () => virtualizerCount * ROW_HEIGHT,
  scrollToIndex: vi.fn(),
  measureElement: () => undefined,
  scrollOffset: 0,
  scrollRect: { height: ROW_HEIGHT * 2 },
  getScrollElement: () => null,
};

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number; onChange?: (instance: MockVirtualizer) => void }) => {
    virtualizerCount = options.count;
    onVirtualizerChange = options.onChange;
    return virtualizer;
  },
}));

beforeEach(() => {
  virtualItems = makeVirtualItems([0, 1, 2, 3, 4]);
  virtualizerCount = 0;
  onVirtualizerChange = undefined;
  virtualizer.scrollOffset = ROW_HEIGHT;
  virtualizer.scrollRect = { height: ROW_HEIGHT * 2 };
});

describe("ContentEditorSideBySideVirtualList viewport range", () => {
  it("loads overscan rows and only marks intersecting rows as visible", () => {
    const onVisibleRangeChange = vi.fn();
    const segments = contentEditorSegmentsFixture.slice(0, 5);

    renderWithContentEditorProviders(
      <ContentEditorSideBySideVirtualList
        segments={segments}
        focusedSegmentId={segments[1]!.id}
        canEdit
        onFocusSegment={vi.fn()}
        onVisibleRangeChange={onVisibleRangeChange}
        onTargetChange={vi.fn()}
      />,
    );

    expect(onVisibleRangeChange).toHaveBeenCalledWith({
      visibleSegmentIds: [segments[1]!.id, segments[2]!.id],
      loadSegmentIds: segments.map((segment) => segment.id),
    });

    virtualizer.scrollOffset = ROW_HEIGHT * 3;
    virtualItems = makeVirtualItems([1, 2, 3, 4]);
    act(() => {
      onVirtualizerChange?.(virtualizer);
    });

    expect(onVisibleRangeChange).toHaveBeenLastCalledWith({
      visibleSegmentIds: [segments[3]!.id, segments[4]!.id],
      loadSegmentIds: [segments[1]!.id, segments[2]!.id, segments[3]!.id, segments[4]!.id],
    });
  });
});
