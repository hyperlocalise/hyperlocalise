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
import { observer } from "mobx-react-lite";

import {
  ContentEditorFilesSidebar,
  ContentEditorPageBody,
} from "@/components/content-editor/files/content-editor-files-sidebar";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorPageHeader } from "./content-editor-page-header";

export type ContentEditorPageActions = {
  onSelectFile: (sourcePath: string) => void;
  onSelectAllFiles?: () => void;
  onLocaleChange: (locale: string) => void;
  onRepositoryChange?: (repositoryFullName: string, destinationSourcePath?: string) => void;
};

export const ContentEditorPageShell = observer(function ContentEditorPageShell({
  backHref,
  actions,
  headerTrailing,
  banners,
  className,
  children,
}: {
  backHref: string;
  actions: ContentEditorPageActions;
  headerTrailing?: ReactNode;
  banners?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const workspace = useContentEditorWorkspace();
  const page = workspace.page;
  const ui = workspace.ui;

  return (
    <main
      className={cn(
        "-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8",
        className,
      )}
    >
      <ContentEditorPageHeader
        backHref={backHref}
        actions={actions}
        headerTrailing={headerTrailing}
      />
      {banners}

      <ContentEditorPageBody
        sidebarCollapsed={ui.filesPanelCollapsed}
        onSidebarCollapsedChange={(collapsed) => ui.setFilesPanelCollapsed(collapsed)}
        sidebar={
          page.showFileSidebar ? (
            <ContentEditorFilesSidebar
              files={page.files}
              selectedSourcePath={page.selectedSourcePath}
              onSelectFile={actions.onSelectFile}
              allFilesSelected={page.allFiles}
              onSelectAllFiles={page.canUseAllFiles ? actions.onSelectAllFiles : undefined}
              repositoryFullNames={page.repositoryFullNames}
              selectedRepositoryFullName={page.selectedRepositoryFullName}
              onRepositoryChange={actions.onRepositoryChange}
            />
          ) : undefined
        }
      >
        {children}
      </ContentEditorPageBody>
    </main>
  );
});
