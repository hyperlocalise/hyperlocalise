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
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { CatWorkspaceState } from "@/components/cat/shared/types";

import {
  CatWorkspaceOrchestrator,
  createCatWorkspace,
  type CreateCatWorkspaceOptions,
} from "./cat-workspace-orchestrator";
import type { CatWorkspaceViewMode } from "./cat-workspace-view-mode";

const CatWorkspaceContext = createContext<CatWorkspaceOrchestrator | null>(null);

export function CatWorkspaceProvider({
  initialState,
  initialSegmentKeyOrId,
  initialViewMode,
  children,
}: {
  initialState: CatWorkspaceState;
  initialSegmentKeyOrId?: string | null;
  initialViewMode?: CatWorkspaceViewMode;
  children: ReactNode;
}) {
  const store = useMemo(
    () => {
      const options: CreateCatWorkspaceOptions | undefined = initialViewMode
        ? { initialViewMode }
        : undefined;
      return createCatWorkspace(initialState, initialSegmentKeyOrId, options);
    },
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
