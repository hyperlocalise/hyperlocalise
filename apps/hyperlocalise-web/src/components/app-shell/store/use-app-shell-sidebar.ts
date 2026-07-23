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
import { useEffect } from "react";

import { useAppShellStore } from "./app-shell-store-context";

type AppShellSidebarConfig = {
  preferredOpen?: boolean | null;
  forceCollapsed?: boolean;
};

export function useAppShellSidebar({
  preferredOpen = null,
  forceCollapsed = false,
}: AppShellSidebarConfig = {}) {
  const store = useAppShellStore();

  useEffect(() => {
    if (!forceCollapsed && preferredOpen === null) {
      return;
    }

    store.sidebar.setPreferredOpen(preferredOpen);
    store.sidebar.setForceCollapsed(forceCollapsed);

    return () => {
      store.sidebar.setForceCollapsed(false);
      store.sidebar.setPreferredOpen(null);
    };
  }, [store, preferredOpen, forceCollapsed]);

  return store.sidebar;
}
