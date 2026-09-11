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
import type { ReactNode } from "react";

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";
import { ContentEditorWorkspaceProvider } from "@/components/content-editor/workspace/content-editor-workspace-context";

import { ContentEditorPageChromeSync } from "./content-editor-page-chrome-sync";
import { ContentEditorPageShell, type ContentEditorPageActions } from "./content-editor-page-shell";
import type { ContentEditorPageChromeSnapshot } from "./content-editor-page-store";

export function ContentEditorPageRoot({
  initialState,
  initialQueueFilter,
  initialQueueSort,
  initialSearch,
  chrome,
  backHref,
  actions,
  banners,
  className,
  children,
}: {
  initialState: ContentEditorWorkspaceState;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  chrome: ContentEditorPageChromeSnapshot;
  backHref: string;
  actions: ContentEditorPageActions;
  banners?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ContentEditorWorkspaceProvider
      initialState={initialState}
      initialQueueFilter={initialQueueFilter}
      initialQueueSort={initialQueueSort}
      initialSearch={initialSearch}
    >
      <ContentEditorPageChromeSync {...chrome} />
      <ContentEditorPageShell
        backHref={backHref}
        actions={actions}
        banners={banners}
        className={className}
      >
        {children}
      </ContentEditorPageShell>
    </ContentEditorWorkspaceProvider>
  );
}
