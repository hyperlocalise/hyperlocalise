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
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { FormattedMessage, useIntl } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { ContentEditorRepositorySelect } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers";
import { contentEditorHeaderPickersMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers.messages";
import { ProjectFilesTree } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files-tree";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  CAT_PANEL_COLLAPSED_SIZE,
  useContentEditorCollapsiblePanel,
} from "@/components/content-editor/workspace/use-content-editor-collapsible-panel";
import { contentEditorWorkspaceViewMessages } from "@/components/content-editor/workspace/content-editor-workspace.messages";
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";
import { cn } from "@/lib/primitives/cn";

import { contentEditorFilesSidebarMessages } from "./content-editor-files-sidebar.messages";

export function ContentEditorFilesSidebar({
  files,
  selectedSourcePath,
  onSelectFile,
  allFilesSelected = false,
  onSelectAllFiles,
  repositoryFullNames,
  selectedRepositoryFullName = null,
  onRepositoryChange,
  footer,
  className,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  allFilesSelected?: boolean;
  onSelectAllFiles?: () => void;
  repositoryFullNames?: readonly string[];
  selectedRepositoryFullName?: string | null;
  onRepositoryChange?: (repositoryFullName: string, destinationSourcePath: string) => void;
  footer?: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const showRepositorySelect = Boolean(repositoryFullNames && repositoryFullNames.length > 0);

  const commitRepositorySelection = (destinationSourcePath: string) => {
    if (!onRepositoryChange || !selectedRepositoryFullName) {
      return;
    }

    onRepositoryChange(selectedRepositoryFullName, destinationSourcePath);
  };

  const handleSelectFile = (sourcePath: string) => {
    commitRepositorySelection(sourcePath);
    onSelectFile(sourcePath);
  };

  const handleSelectAllFiles = () => {
    commitRepositorySelection(CONTENT_EDITOR_ALL_FILES_SOURCE_PATH);
    onSelectAllFiles?.();
  };

  const handleRepositoryChange = (repositoryFullName: string) => {
    if (!onRepositoryChange) {
      return;
    }

    const destinationSourcePath = allFilesSelected
      ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH
      : (selectedSourcePath ?? "");
    if (!destinationSourcePath) {
      return;
    }

    onRepositoryChange(repositoryFullName, destinationSourcePath);
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="space-y-3 border-b border-border px-3 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage {...contentEditorFilesSidebarMessages.filesTitle} />
        </h2>

        {onSelectAllFiles ? (
          <Button
            type="button"
            variant={allFilesSelected ? "default" : "outline"}
            size="sm"
            className="h-8 w-full justify-start"
            onClick={handleSelectAllFiles}
          >
            <FormattedMessage {...contentEditorHeaderPickersMessages.allFiles} />
          </Button>
        ) : null}

        {showRepositorySelect && repositoryFullNames ? (
          <ContentEditorRepositorySelect
            repositoryFullNames={repositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 px-2 py-2">
        <ProjectFilesTree
          files={files}
          selectedSourcePath={allFilesSelected ? "" : (selectedSourcePath ?? "")}
          onSelectFile={handleSelectFile}
          onActivateFile={handleSelectFile}
          ariaLabel={intl.formatMessage(contentEditorFilesSidebarMessages.sourceFilesAriaLabel)}
          fillHeight
        />
      </div>

      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </aside>
  );
}

export const CAT_FILES_LAYOUT_ID = "content-editor-page-files";

const FILES_PANEL_IDS = ["files", "workspace"] as const;
const FILES_DEFAULT_SIZE = "17.5rem";
const FILES_MIN_SIZE = "12rem";
const FILES_MAX_SIZE = "30rem";
const WORKSPACE_MIN_SIZE = "28rem";
/** Complement of the compact workspace breakpoint in `content-editor-workspace.tsx`. */
const FILES_SIDEBAR_QUERY = "(min-width: 1024px)";

/**
 * The file tree is only offered from the `lg` breakpoint up; narrower viewports
 * reach files through the header picker instead.
 */
function useFilesSidebarAvailable() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(FILES_SIDEBAR_QUERY);
    const sync = () => setIsAvailable(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return isAvailable;
}

export function ContentEditorPageBody({
  sidebar,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
  children,
}: {
  sidebar?: ReactNode;
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  const intl = useIntl();
  const isSidebarAvailable = useFilesSidebarAvailable();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: CAT_FILES_LAYOUT_ID,
    panelIds: [...FILES_PANEL_IDS],
    onlySaveAfterUserInteractions: true,
  });
  const hasSidebar = Boolean(sidebar);
  // Narrow viewports pin the pane shut without overwriting the saved preference.
  const isCollapsed = !isSidebarAvailable || sidebarCollapsed;
  const filesPanel = useContentEditorCollapsiblePanel({
    collapsed: hasSidebar ? isCollapsed : undefined,
    onCollapsedChange: isSidebarAvailable ? onSidebarCollapsedChange : undefined,
  });

  return (
    <ResizablePanelGroup
      id={CAT_FILES_LAYOUT_ID}
      orientation="horizontal"
      className="min-h-0 flex-1 overflow-hidden"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {/* Keyed so rendering the sidebar never remounts the workspace subtree. */}
      {hasSidebar ? (
        <Fragment key="files">
          <ResizablePanel
            id="files"
            defaultSize={FILES_DEFAULT_SIZE}
            minSize={FILES_MIN_SIZE}
            maxSize={FILES_MAX_SIZE}
            collapsible
            collapsedSize={CAT_PANEL_COLLAPSED_SIZE}
            panelRef={filesPanel.panelRef}
            onResize={filesPanel.onResize}
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <div
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
              inert={isCollapsed}
            >
              {sidebar}
            </div>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="hidden lg:flex"
            aria-label={intl.formatMessage(contentEditorWorkspaceViewMessages.resizeFilesPanel)}
          />
        </Fragment>
      ) : null}
      <ResizablePanel
        key="workspace"
        id="workspace"
        minSize={isSidebarAvailable && hasSidebar ? WORKSPACE_MIN_SIZE : undefined}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6 lg:pl-2">
          {children}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
