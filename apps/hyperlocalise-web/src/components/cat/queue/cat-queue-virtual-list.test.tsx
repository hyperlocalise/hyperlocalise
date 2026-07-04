// @vitest-environment happy-dom

import { act } from "react";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { catSegmentsFixture } from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatQueueVirtualList } from "./cat-queue-virtual-list";

const ROW_HEIGHT = 88;

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
  measureElement: () => undefined;
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
  measureElement: () => undefined,
};

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize?: () => number;
    onChange?: (instance: MockVirtualizer) => void;
  }) => {
    virtualizerCount = options.count;
    onVirtualizerChange = options.onChange;
    return virtualizer;
  },
}));

beforeEach(() => {
  virtualItems = makeVirtualItems([0, 1, 2]);
  virtualizerCount = 0;
  onVirtualizerChange = undefined;
});

describe("CatQueueVirtualList pagination", () => {
  it("loads the next page when the virtual range reaches the end during scroll", async () => {
    const onNearEnd = vi.fn();
    const segments = catSegmentsFixture.slice(0, 12);

    renderWithCatProviders(
      <CatQueueVirtualList
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
        hasMore
        onNearEnd={onNearEnd}
      />,
    );

    expect(onNearEnd).not.toHaveBeenCalled();

    virtualItems = makeVirtualItems([8, 9, 10, 11]);
    act(() => {
      onVirtualizerChange?.(virtualizer);
    });

    await waitFor(() => {
      expect(onNearEnd).toHaveBeenCalledTimes(1);
    });
  });
});
