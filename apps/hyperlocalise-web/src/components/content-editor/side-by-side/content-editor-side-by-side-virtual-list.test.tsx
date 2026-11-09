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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { contentEditorSegmentsFixture } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorQueueStore } from "@/components/content-editor/workspace/store/content-editor-queue-store";

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
  scrollToOffset: (offset: number) => void;
  getOffsetForIndex: (index: number, align: string) => [number, string];
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
  scrollToOffset: vi.fn(),
  getOffsetForIndex: (index: number) => [index * ROW_HEIGHT, "start"],
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

  it("does not keep loading while the viewport stays at the same end after a page appends", () => {
    const onNearEnd = vi.fn();
    const firstPage = contentEditorSegmentsFixture.slice(0, 12);
    const nextPage = Array.from({ length: 12 }, (_, index) => ({
      ...firstPage[index % firstPage.length]!,
      id: `seg-next-${index}`,
      index: firstPage.length + index + 1,
    }));

    const { rerender } = renderWithContentEditorProviders(
      <ContentEditorSideBySideVirtualList
        segments={firstPage}
        focusedSegmentId={firstPage[0]!.id}
        canEdit
        onFocusSegment={vi.fn()}
        onVisibleRangeChange={vi.fn()}
        onTargetChange={vi.fn()}
        hasMore
        onNearEnd={onNearEnd}
      />,
    );

    virtualItems = makeVirtualItems([8, 9, 10, 11]);
    act(() => {
      onVirtualizerChange?.(virtualizer);
    });
    expect(onNearEnd).toHaveBeenCalledTimes(1);

    virtualItems = makeVirtualItems([20, 21, 22, 23]);
    rerender(
      <ContentEditorSideBySideVirtualList
        segments={[...firstPage, ...nextPage]}
        focusedSegmentId={firstPage[0]!.id}
        canEdit
        onFocusSegment={vi.fn()}
        onVisibleRangeChange={vi.fn()}
        onTargetChange={vi.fn()}
        hasMore
        onNearEnd={onNearEnd}
      />,
    );

    expect(onNearEnd).toHaveBeenCalledTimes(1);
  });
});

describe("ContentEditorSideBySideVirtualList selection", () => {
  function renderList(
    overrides: Partial<Parameters<typeof ContentEditorSideBySideVirtualList>[0]> = {},
  ) {
    const segments = contentEditorSegmentsFixture.slice(0, 5);
    const props: Parameters<typeof ContentEditorSideBySideVirtualList>[0] = {
      segments,
      focusedSegmentId: segments[0]!.id,
      canEdit: true,
      onFocusSegment: vi.fn(),
      onVisibleRangeChange: vi.fn(),
      onTargetChange: vi.fn(),
      ...overrides,
    };
    return {
      props,
      ...renderWithContentEditorProviders(<ContentEditorSideBySideVirtualList {...props} />),
    };
  }

  it("shows a tick box per row only in Select mode", () => {
    const { props, rerender } = renderList({ onToggleSegmentChecked: vi.fn() });

    expect(screen.queryAllByRole("checkbox", { name: /^Select / })).toHaveLength(0);

    rerender(<ContentEditorSideBySideVirtualList {...props} showSelection />);

    expect(screen.getAllByRole("checkbox", { name: /^Select / })).toHaveLength(5);
  });

  it("ticks a row without focusing it and reports the string id", async () => {
    const user = userEvent.setup();
    const onToggleSegmentChecked = vi.fn();
    const onFocusSegment = vi.fn();
    const segments = contentEditorSegmentsFixture.slice(0, 5);
    renderList({ showSelection: true, onToggleSegmentChecked, onFocusSegment });

    await user.click(screen.getByRole("checkbox", { name: `Select ${segments[2]!.key}` }));

    expect(onToggleSegmentChecked).toHaveBeenCalledWith(segments[2]!.id, true);
    expect(onFocusSegment).not.toHaveBeenCalled();
  });

  it("keeps ticks on rows that scroll back into view after more strings load", () => {
    const firstPage = contentEditorSegmentsFixture.slice(0, 5);
    const nextPage = contentEditorSegmentsFixture.slice(5, 10);
    const checkedSegmentIds = new Set([firstPage[1]!.id]);
    const { props, rerender } = renderList({
      showSelection: true,
      checkedSegmentIds,
      onToggleSegmentChecked: vi.fn(),
    });

    expect(screen.getByRole("checkbox", { name: `Select ${firstPage[1]!.key}` })).toBeChecked();

    virtualItems = makeVirtualItems([5, 6, 7, 8, 9]);
    rerender(
      <ContentEditorSideBySideVirtualList {...props} segments={[...firstPage, ...nextPage]} />,
    );
    expect(
      screen.queryByRole("checkbox", { name: `Select ${firstPage[1]!.key}` }),
    ).not.toBeInTheDocument();

    virtualItems = makeVirtualItems([0, 1, 2, 3, 4]);
    rerender(
      <ContentEditorSideBySideVirtualList {...props} segments={[...firstPage, ...nextPage]} />,
    );
    expect(screen.getByRole("checkbox", { name: `Select ${firstPage[1]!.key}` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: `Select ${firstPage[2]!.key}` })).not.toBeChecked();
  });
});

describe("ContentEditorSideBySideVirtualList with the queue store", () => {
  it("shows a tick as soon as the store records it", async () => {
    const user = userEvent.setup();
    const store = new ContentEditorQueueStore();
    const segments = contentEditorSegmentsFixture.slice(0, 5);

    renderWithContentEditorProviders(
      <ContentEditorSideBySideVirtualList
        segments={segments}
        focusedSegmentId={segments[0]!.id}
        canEdit
        onFocusSegment={vi.fn()}
        onVisibleRangeChange={vi.fn()}
        onTargetChange={vi.fn()}
        checkedSegmentIds={store.checkedSegmentIds}
        showSelection
        onToggleSegmentChecked={(segmentId, checked) => store.toggleChecked(segmentId, checked)}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: `Select ${segments[1]!.key}` });
    await user.click(checkbox);

    expect(store.checkedSegmentIds.has(segments[1]!.id)).toBe(true);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(store.checkedSegmentIds.has(segments[1]!.id)).toBe(false);
    expect(checkbox).not.toBeChecked();
  });
});
