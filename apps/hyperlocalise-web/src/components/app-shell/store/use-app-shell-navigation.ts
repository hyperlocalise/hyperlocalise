"use client";

import { useEffect } from "react";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

import type { NavigationProjectContext } from "./navigation-store";
import { useAppShellStore } from "./app-shell-store-context";

type AppShellNavigationCustomConfig = {
  groups: readonly NavigationGroup[];
  projectContext?: NavigationProjectContext;
};

export function useAppShellNavigationCustom({
  groups,
  projectContext,
}: AppShellNavigationCustomConfig) {
  const store = useAppShellStore();

  useEffect(() => {
    store.navigation.setCustomNavigation(groups, projectContext);

    return () => {
      store.navigation.clearCustomMode();
    };
  }, [store, groups, projectContext]);
}

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
    store.sidebar.setPreferredOpen(preferredOpen);
    store.sidebar.setForceCollapsed(forceCollapsed);

    return () => {
      store.sidebar.setForceCollapsed(false);
      store.sidebar.setPreferredOpen(null);
    };
  }, [store, preferredOpen, forceCollapsed]);

  return store.sidebar;
}
