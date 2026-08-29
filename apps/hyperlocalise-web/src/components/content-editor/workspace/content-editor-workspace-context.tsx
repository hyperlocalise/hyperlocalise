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

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";

import {
  ContentEditorWorkspaceOrchestrator,
  createCatWorkspace,
  type CreateCatWorkspaceOptions,
} from "./content-editor-workspace-orchestrator";
import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";

const ContentEditorWorkspaceContext = createContext<ContentEditorWorkspaceOrchestrator | null>(
  null,
);

export function ContentEditorWorkspaceProvider({
  initialState,
  initialSegmentKeyOrId,
  initialViewMode,
  initialQueueFilter,
  initialQueueSort,
  initialSearch,
  children,
}: {
  initialState: ContentEditorWorkspaceState;
  initialSegmentKeyOrId?: string | null;
  initialViewMode?: ContentEditorWorkspaceViewMode;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => {
      const options: CreateCatWorkspaceOptions | undefined =
        initialViewMode || initialQueueFilter || initialQueueSort || initialSearch
          ? {
              ...(initialViewMode ? { initialViewMode } : {}),
              ...(initialQueueFilter ? { initialQueueFilter } : {}),
              ...(initialQueueSort ? { initialQueueSort } : {}),
              ...(initialSearch ? { initialSearch } : {}),
            }
          : undefined;
      return createCatWorkspace(initialState, initialSegmentKeyOrId, options);
    },
    // Store is scoped to workspace mount; parent key handles remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ContentEditorWorkspaceContext.Provider value={store}>
      {children}
    </ContentEditorWorkspaceContext.Provider>
  );
}

export function useContentEditorWorkspace() {
  const store = useContext(ContentEditorWorkspaceContext);
  if (!store) {
    throw new Error("useContentEditorWorkspace must be used within ContentEditorWorkspaceProvider");
  }

  return store;
}

export function useOptionalCatWorkspace() {
  return useContext(ContentEditorWorkspaceContext);
}
