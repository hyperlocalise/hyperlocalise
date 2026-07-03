"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { CatWorkspaceState } from "@/components/cat/shared/types";

import { CatWorkspaceStore, createCatWorkspaceStore } from "./cat-workspace-store";

const CatWorkspaceStoreContext = createContext<CatWorkspaceStore | null>(null);

export function CatWorkspaceStoreProvider({
  initialState,
  initialSegmentKeyOrId,
  children,
}: {
  initialState: CatWorkspaceState;
  initialSegmentKeyOrId?: string | null;
  children: ReactNode;
}) {
  const store = useMemo(
    () => createCatWorkspaceStore(initialState, initialSegmentKeyOrId),
    // Store is scoped to workspace mount; parent key handles remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <CatWorkspaceStoreContext.Provider value={store}>{children}</CatWorkspaceStoreContext.Provider>
  );
}

export function useCatWorkspaceStore() {
  const store = useContext(CatWorkspaceStoreContext);
  if (!store) {
    throw new Error("useCatWorkspaceStore must be used within CatWorkspaceStoreProvider");
  }

  return store;
}

export function useOptionalCatWorkspaceStore() {
  return useContext(CatWorkspaceStoreContext);
}
