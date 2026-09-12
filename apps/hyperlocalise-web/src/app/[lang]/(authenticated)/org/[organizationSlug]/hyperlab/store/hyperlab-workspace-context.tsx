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

import {
  createHyperlabWorkspace,
  type HyperlabWorkspaceOrchestrator,
} from "./hyperlab-orchestrator";

const HyperlabWorkspaceContext = createContext<HyperlabWorkspaceOrchestrator | null>(null);

export function HyperlabWorkspaceProvider({ children }: { children: ReactNode }) {
  const store = useMemo(
    () => createHyperlabWorkspace(),
    // Store is scoped to page mount; parent key handles remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <HyperlabWorkspaceContext.Provider value={store}>{children}</HyperlabWorkspaceContext.Provider>
  );
}

export function useHyperlabWorkspace() {
  const store = useContext(HyperlabWorkspaceContext);
  if (!store) {
    throw new Error("useHyperlabWorkspace must be used within HyperlabWorkspaceProvider");
  }

  return store;
}

export function useOptionalHyperlabWorkspace() {
  return useContext(HyperlabWorkspaceContext);
}
