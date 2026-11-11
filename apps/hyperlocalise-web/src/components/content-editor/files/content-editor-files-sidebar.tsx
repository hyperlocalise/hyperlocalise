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
import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import { EyeIcon, EyeSlashIcon, MagnifyingGlassIcon, StackIcon } from "@phosphor-icons/react";
import { useDefaultLayout } from "react-resizable-panels";
import { FormattedMessage, useIntl } from "react-intl";

import type {
  ProjectFileProgressRecord,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { ContentEditorRepositorySelect } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers";
import { contentEditorHeaderPickersMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers.messages";
import { ProjectFilesTree } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files-tree";
import { projectFilesTreeMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files-tree.messages";
import { projectFilesTreeCollapsedFoldersStorageKey } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/use-project-files-tree-collapsed-folders";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
  hiddenFilesHidden = false,
  onHiddenFilesHiddenChange,
  fileProgress,
  footer,
  className,
  collapsedFoldersScope,
}: {
  files: ProjectFileRecord[];
  /** Remembers collapsed folders per scope (e.g. org and project) across reloads. */
  collapsedFoldersScope?: string;
  fileProgress?: readonly ProjectFileProgressRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  allFilesSelected?: boolean;
  onSelectAllFiles?: () => void;
  repositoryFullNames?: readonly string[];
  selectedRepositoryFullName?: string | null;
  onRepositoryChange?: (repositoryFullName: string, destinationSourcePath: string) => void;
  hiddenFilesHidden?: boolean;
  /** Offers the hidden-files toggle. Omit when no file is hidden. */
  onHiddenFilesHiddenChange?: (hidden: boolean) => void;
  footer?: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const [searchQuery, setSearchQuery] = useState("");
  // A single repository is auto-selected, so the switcher only earns space with a real choice.
  const showRepositorySelect = Boolean(repositoryFullNames && repositoryFullNames.length > 1);

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
      <h2 className="sr-only">
        <FormattedMessage {...contentEditorFilesSidebarMessages.filesTitle} />
      </h2>
      <div className="space-y-2 border-b border-border px-3 py-2.5">
        {showRepositorySelect && repositoryFullNames ? (
          <ContentEditorRepositorySelect
            repositoryFullNames={repositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}

        <div className="flex items-center gap-1">
          <InputGroup className="h-8 min-w-0 flex-1">
            <InputGroupAddon>
              <MagnifyingGlassIcon className="size-4" aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder={intl.formatMessage(projectFilesTreeMessages.searchFiles)}
              aria-label={intl.formatMessage(projectFilesTreeMessages.searchFiles)}
            />
          </InputGroup>
          {onHiddenFilesHiddenChange ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 shrink-0 text-muted-foreground"
              aria-pressed={hiddenFilesHidden}
              aria-label={intl.formatMessage(
                hiddenFilesHidden
                  ? contentEditorFilesSidebarMessages.showHiddenFiles
                  : contentEditorFilesSidebarMessages.hideHiddenFiles,
              )}
              title={intl.formatMessage(
                hiddenFilesHidden
                  ? contentEditorFilesSidebarMessages.showHiddenFiles
                  : contentEditorFilesSidebarMessages.hideHiddenFiles,
              )}
              onClick={() => onHiddenFilesHiddenChange(!hiddenFilesHidden)}
            >
              {hiddenFilesHidden ? (
                <EyeSlashIcon className="size-4" aria-hidden />
              ) : (
                <EyeIcon className="size-4" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
        {onSelectAllFiles ? (
          <button
            type="button"
            aria-pressed={allFilesSelected}
            className={cn(
              "flex h-7 w-full shrink-0 items-center gap-2 rounded-md px-2 text-start text-[13px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
              allFilesSelected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={handleSelectAllFiles}
          >
            <StackIcon className="size-4 shrink-0" aria-hidden />
            <FormattedMessage {...contentEditorHeaderPickersMessages.allFiles} />
          </button>
        ) : null}
        <div className="min-h-0 flex-1">
          <ProjectFilesTree
            files={files}
            selectedSourcePath={allFilesSelected ? "" : (selectedSourcePath ?? "")}
            onSelectFile={handleSelectFile}
            onActivateFile={handleSelectFile}
            ariaLabel={intl.formatMessage(contentEditorFilesSidebarMessages.sourceFilesAriaLabel)}
            fillHeight
            fileProgress={fileProgress}
            searchQuery={searchQuery}
            collapsedFoldersStorageKey={
              collapsedFoldersScope
                ? projectFilesTreeCollapsedFoldersStorageKey(
                    `content-editor:${collapsedFoldersScope}`,
                  )
                : undefined
            }
          />
        </div>
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

function subscribeFilesSidebarAvailable(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(FILES_SIDEBAR_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getFilesSidebarAvailable() {
  return window.matchMedia(FILES_SIDEBAR_QUERY).matches;
}

/** Desktop-first so hydration does not start the pane collapsed. */
function getFilesSidebarAvailableServerSnapshot() {
  return true;
}

/**
 * The file tree is only offered from the `lg` breakpoint up; narrower viewports
 * reach files through the header picker instead.
 */
function useFilesSidebarAvailable() {
  return useSyncExternalStore(
    subscribeFilesSidebarAvailable,
    getFilesSidebarAvailable,
    getFilesSidebarAvailableServerSnapshot,
  );
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
