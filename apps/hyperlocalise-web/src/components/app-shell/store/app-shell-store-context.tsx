"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";
import {
  DISABLED_WORKSPACE_FEATURE_FLAGS,
  type WorkspaceFeatureFlagState,
} from "@/lib/flags/workos-flag-entities";

import { AppShellStore, createAppShellStore } from "./app-shell-store";

const AppShellStoreContext = createContext<AppShellStore | null>(null);

export function AppShellStoreProvider({
  defaultNavigationGroups,
  workspaceFeatureFlags = DISABLED_WORKSPACE_FEATURE_FLAGS,
  children,
}: {
  defaultNavigationGroups: readonly NavigationGroup[];
  workspaceFeatureFlags?: WorkspaceFeatureFlagState;
  children: ReactNode;
}) {
  const [store] = useState(() =>
    createAppShellStore(defaultNavigationGroups, workspaceFeatureFlags),
  );
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  // Reset during render, not in useEffect. Passive effects flush bottom-up, so a
  // provider effect would run after page hooks register and immediately clear them.
  if (previousPathnameRef.current !== pathname) {
    store.resetPageScope();
    previousPathnameRef.current = pathname;
  }

  return <AppShellStoreContext.Provider value={store}>{children}</AppShellStoreContext.Provider>;
}

export function useAppShellStore() {
  const store = useContext(AppShellStoreContext);
  if (!store) {
    throw new Error("useAppShellStore must be used within AppShellStoreProvider");
  }

  return store;
}

export function useOptionalAppShellStore() {
  return useContext(AppShellStoreContext);
}
