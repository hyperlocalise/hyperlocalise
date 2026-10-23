"use client";

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
import { useCallback, useEffect, useRef } from "react";
import { usePanelRef, type PanelImperativeHandle, type PanelSize } from "react-resizable-panels";

/** Width a collapsed content editor pane shrinks to. */
export const CAT_PANEL_COLLAPSED_SIZE = "0px";

/**
 * Keeps a `collapsible` Panel in sync with externally owned collapsed state so
 * the pane answers to both the toolbar toggles and a drag past its `minSize`.
 */
export function useContentEditorCollapsiblePanel({
  collapsed,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const panelRef = usePanelRef();
  const collapsedRef = useRef(collapsed);
  const applyingRef = useRef(false);
  if (collapsed !== undefined && collapsedRef.current !== collapsed) {
    // Mark the next resize as programmatic before children flush. Viewport
    // pin/unpin changes `collapsed` while the pane is still at 0%, and that
    // measurement must not be reported as a user drag.
    applyingRef.current = true;
  }
  collapsedRef.current = collapsed;

  const applyCollapsed = useCallback(
    (shouldCollapse: boolean) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const isCollapsed = readPanelCollapsed(panel);
      if (isCollapsed === undefined) {
        return;
      }

      if (shouldCollapse && !isCollapsed) {
        applyingRef.current = true;
        panel.collapse();
        return;
      }

      if (!shouldCollapse && isCollapsed) {
        applyingRef.current = true;
        panel.expand();
      }
    },
    [panelRef],
  );

  useEffect(() => {
    if (collapsed === undefined) {
      return;
    }

    applyCollapsed(collapsed);
  }, [applyCollapsed, collapsed]);

  const onResize = useCallback(
    (size: PanelSize, _id: string | number | undefined, prevSize: PanelSize | undefined) => {
      const target = collapsedRef.current;
      if (target === undefined) {
        return;
      }

      const isCollapsed = size.asPercentage === 0;
      if (isCollapsed === target) {
        applyingRef.current = false;
        return;
      }

      // The mount effect runs before the group has a layout, so the initial
      // target is applied on this first measurement instead.
      if (prevSize === undefined || applyingRef.current) {
        applyCollapsed(target);
        return;
      }

      onCollapsedChange?.(isCollapsed);
    },
    [applyCollapsed, onCollapsedChange],
  );

  return { panelRef, onResize };
}

/**
 * The imperative handle throws until the group has derived constraints for a
 * newly mounted panel, e.g. when the file tree mounts into an existing layout.
 * The panel's first `onResize` reapplies the target once it is registered.
 */
function readPanelCollapsed(panel: PanelImperativeHandle): boolean | undefined {
  try {
    return panel.isCollapsed();
  } catch {
    return undefined;
  }
}
