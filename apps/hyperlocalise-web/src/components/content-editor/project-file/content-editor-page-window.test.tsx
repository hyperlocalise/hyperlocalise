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

import { fireEvent, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Virtualizer } from "@tanstack/react-virtual";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { useEditorPageWindow } from "./content-editor-page-window";

const ROW_HEIGHT = 80;

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

function PageWindowProbe({
  segments,
  virtualizer,
}: {
  segments: Array<{ id: string }>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEditorPageWindow(segments, scrollRef, virtualizer);
  return <div data-testid="scroller" ref={scrollRef} />;
}

describe("useEditorPageWindow", () => {
  it("keeps the same segment in view when the next page appends", () => {
    const scrollToOffset = vi.fn();
    const firstPage = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const virtualizer = {
      getVirtualItems: () => makeVirtualItems([1, 2]),
      getOffsetForIndex: (index: number) => [index * ROW_HEIGHT, "start"] as const,
      scrollToOffset,
    } as unknown as Virtualizer<HTMLDivElement, Element>;

    const { rerender } = renderWithContentEditorProviders(
      <PageWindowProbe segments={firstPage} virtualizer={virtualizer} />,
    );

    const scroller = screen.getByTestId("scroller");
    scroller.scrollTop = ROW_HEIGHT + 20;
    fireEvent.scroll(scroller);

    rerender(
      <PageWindowProbe
        segments={[...firstPage, { id: "d" }, { id: "e" }]}
        virtualizer={virtualizer}
      />,
    );

    expect(scrollToOffset).toHaveBeenCalledWith(ROW_HEIGHT + 20);
  });
});
