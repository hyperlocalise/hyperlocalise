"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

import { AppShellStore, createAppShellStore } from "./app-shell-store";

const AppShellStoreContext = createContext<AppShellStore | null>(null);

export function AppShellStoreProvider({
  defaultNavigationGroups,
  children,
}: {
  defaultNavigationGroups: readonly NavigationGroup[];
  children: ReactNode;
}) {
  const [store] = useState(() => createAppShellStore(defaultNavigationGroups));
  const pathname = usePathname();

  useEffect(() => {
    store.resetPageScope();
  }, [pathname, store]);

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
