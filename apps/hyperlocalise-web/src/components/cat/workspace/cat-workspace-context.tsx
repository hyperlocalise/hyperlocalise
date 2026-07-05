"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { CatWorkspaceState } from "@/components/cat/shared/types";

import { CatWorkspaceOrchestrator, createCatWorkspace } from "./cat-workspace-orchestrator";

const CatWorkspaceContext = createContext<CatWorkspaceOrchestrator | null>(null);

export function CatWorkspaceProvider({
  initialState,
  initialSegmentKeyOrId,
  children,
}: {
  initialState: CatWorkspaceState;
  initialSegmentKeyOrId?: string | null;
  children: ReactNode;
}) {
  const store = useMemo(
    () => createCatWorkspace(initialState, initialSegmentKeyOrId),
    // Store is scoped to workspace mount; parent key handles remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <CatWorkspaceContext.Provider value={store}>{children}</CatWorkspaceContext.Provider>;
}

export function useCatWorkspace() {
  const store = useContext(CatWorkspaceContext);
  if (!store) {
    throw new Error("useCatWorkspace must be used within CatWorkspaceProvider");
  }

  return store;
}

export function useOptionalCatWorkspace() {
  return useContext(CatWorkspaceContext);
}
