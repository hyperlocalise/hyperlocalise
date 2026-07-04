"use client";

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
    store.sidebar.setPreferredOpen(preferredOpen);
    store.sidebar.setForceCollapsed(forceCollapsed);

    return () => {
      store.sidebar.setForceCollapsed(false);
      store.sidebar.setPreferredOpen(null);
    };
  }, [store, preferredOpen, forceCollapsed]);

  return store.sidebar;
}
