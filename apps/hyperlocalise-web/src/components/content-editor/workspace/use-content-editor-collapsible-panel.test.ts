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

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const panel = vi.hoisted(() => {
  let collapsed = false;
  const ref = {
    current: {
      isCollapsed: () => collapsed,
      collapse: vi.fn(() => {
        collapsed = true;
      }),
      expand: vi.fn(() => {
        collapsed = false;
      }),
    },
  };
  return {
    ref,
    reset() {
      collapsed = false;
      ref.current.collapse.mockClear();
      ref.current.expand.mockClear();
    },
  };
});

vi.mock("react-resizable-panels", () => ({
  usePanelRef: () => panel.ref,
}));

import { useContentEditorCollapsiblePanel } from "./use-content-editor-collapsible-panel";

function size(asPercentage: number) {
  return { asPercentage, inPixels: asPercentage };
}

describe("useContentEditorCollapsiblePanel", () => {
  beforeEach(() => {
    panel.reset();
  });

  it("does not report collapse while applying an expanded target", () => {
    const onCollapsedChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ collapsed }) => useContentEditorCollapsiblePanel({ collapsed, onCollapsedChange }),
      { initialProps: { collapsed: true } },
    );

    result.current.onResize(size(0), "files", undefined);
    expect(onCollapsedChange).not.toHaveBeenCalled();

    rerender({ collapsed: false });
    result.current.onResize(size(0), "files", size(0));

    expect(panel.ref.current.expand).toHaveBeenCalled();
    expect(onCollapsedChange).not.toHaveBeenCalled();
  });

  it("reports a user drag after the panel has settled", () => {
    const onCollapsedChange = vi.fn();
    const { result } = renderHook(() =>
      useContentEditorCollapsiblePanel({ collapsed: false, onCollapsedChange }),
    );

    result.current.onResize(size(20), "files", undefined);
    result.current.onResize(size(0), "files", size(20));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});
