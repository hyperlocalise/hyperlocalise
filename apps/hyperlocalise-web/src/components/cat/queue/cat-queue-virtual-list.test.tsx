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
let lastGetItemKey: ((index: number) => string | number) | undefined;

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
    getItemKey?: (index: number) => string | number;
    onChange?: (instance: MockVirtualizer) => void;
  }) => {
    virtualizerCount = options.count;
    lastGetItemKey = options.getItemKey;
    onVirtualizerChange = options.onChange;
    return virtualizer;
  },
}));

beforeEach(() => {
  virtualItems = makeVirtualItems([0, 1, 2]);
  virtualizerCount = 0;
  onVirtualizerChange = undefined;
  lastGetItemKey = undefined;
});

describe("CatQueueVirtualList pagination", () => {
  it("keys virtual rows by segment id so mid-list removals keep stable measurements", () => {
    const segments = catSegmentsFixture.slice(0, 3);

    renderWithCatProviders(
      <CatQueueVirtualList
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
      />,
    );

    expect(lastGetItemKey?.(0)).toBe(segments[0]!.id);
    expect(lastGetItemKey?.(1)).toBe(segments[1]!.id);
    expect(lastGetItemKey?.(2)).toBe(segments[2]!.id);
  });

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
