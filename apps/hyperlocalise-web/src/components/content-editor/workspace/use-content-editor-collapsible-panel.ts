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
import { usePanelRef, type PanelSize } from "react-resizable-panels";

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
  collapsedRef.current = collapsed;

  const applyCollapsed = useCallback(
    (shouldCollapse: boolean) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      if (shouldCollapse && !panel.isCollapsed()) {
        panel.collapse();
        return;
      }

      if (!shouldCollapse && panel.isCollapsed()) {
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
        return;
      }

      // The panel's imperative handle is a no-op until the group has computed
      // its first layout, so an initially collapsed pane has to be applied on
      // this first measurement rather than from the mount effect.
      if (prevSize === undefined) {
        applyCollapsed(target);
        return;
      }

      onCollapsedChange?.(isCollapsed);
    },
    [applyCollapsed, onCollapsedChange],
  );

  return { panelRef, onResize };
}
