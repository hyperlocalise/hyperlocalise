"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
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
