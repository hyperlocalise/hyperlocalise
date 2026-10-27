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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ContextMenuOpenContext, FileTreeRowDecorationContext } from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { preloadFileTree } from "@pierre/trees/ssr";
import "@pierre/trees/web-components";
import { useIntl, type IntlShape } from "react-intl";

import type {
  ProjectFileProgressRecord,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";

import {
  buildProjectFileProgressDecoration,
  buildProjectFileProgressLookup,
  findProjectFileProgress,
} from "./project-files-tree-decoration";
import {
  ProjectFileTreeContextMenu,
  type ProjectFileTreeActionsConfig,
} from "./project-file-tree-context-menu";
import { projectFilesTreeMessages as messages } from "./project-files-tree.messages";
import { PROJECT_FILES_TREE_ICONS } from "./project-files-tree-icons";
import { dedupeProjectFilesBySourcePath, formatBytes } from "./project-files-shared";
import { buildProjectFileActionCapabilities } from "./use-project-file-actions";
import { useProjectFilesTreeCollapsedFolders } from "./use-project-files-tree-collapsed-folders";

export const TREE_HEIGHT_PX = 480;

const NO_FILE_PROGRESS: readonly ProjectFileProgressRecord[] = [];

/** Let the progress badge keep its width; long file names middle-truncate instead. */
const PROJECT_FILES_TREE_UNSAFE_CSS = `[data-item-section="decoration"] { flex: 1 0 auto; }`;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

type ActiveFileContextMenu = {
  file: ProjectFileRecord;
  context: ContextMenuOpenContext;
};

function buildProjectFilesTreeStyle(fillHeight: boolean): CSSProperties {
  return {
    width: "100%",
    minWidth: "100%",
    height: fillHeight ? "100%" : `${TREE_HEIGHT_PX}px`,
    minHeight: fillHeight ? 0 : undefined,
    backgroundColor: "transparent",
    color: "var(--foreground)",
    borderColor: "var(--border)",
    "--trees-bg-override": "var(--background)",
    "--trees-bg-muted-override": "var(--muted)",
    "--trees-border-color-override": "var(--border)",
    "--trees-fg-override": "var(--foreground)",
    "--trees-fg-muted-override": "var(--muted-foreground)",
    "--trees-focus-ring-color-override": "var(--ring)",
    "--trees-input-bg-override": "var(--background)",
    "--trees-search-bg-override": "var(--background)",
    "--trees-search-fg-override": "var(--foreground)",
    "--trees-selected-bg-override": "var(--muted)",
    "--trees-selected-fg-override": "var(--foreground)",
    "--trees-selected-focused-border-color-override": "var(--ring)",
    "--trees-git-ignored-color-override": "var(--muted-foreground)",
    "--trees-git-lane-width-override": "0px",
  } as CSSProperties;
}

function formatNullableDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function fileListMetadata(file: ProjectFileRecord, intl: IntlShape) {
  const uploadedAt = formatNullableDate(file.uploadedAt);
  if (file.provider && file.byteSize === null) {
    return [
      file.provider.format,
      file.provider.resourceType === "file"
        ? intl.formatMessage(messages.providerFile)
        : intl.formatMessage(messages.providerKey),
      uploadedAt,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [formatBytes(file.byteSize, intl), uploadedAt].filter(Boolean).join(" · ");
}

export function ProjectFilesTree({
  files,
  selectedSourcePath,
  onSelectFile,
  onActivateFile,
  fileActions,
  ariaLabel,
  fillHeight = false,
  fileProgress,
  searchQuery,
  collapsedFoldersStorageKey,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  ariaLabel?: string;
  /** Persists collapsed folders in localStorage under this key. */
  collapsedFoldersStorageKey?: string;
  /** Stretch to the parent height instead of the fixed TREE_HEIGHT_PX. */
  fillHeight?: boolean;
  /** Per-file progress for the active locale, shown as "translated% · approved%". */
  fileProgress?: readonly ProjectFileProgressRecord[];
  /** Filters rows from a caller-owned input and hides the built-in search box. */
  searchQuery?: string;
}) {
  if (fileActions) {
    return (
      <ProjectFilesTreeView
        files={files}
        selectedSourcePath={selectedSourcePath}
        onSelectFile={onSelectFile}
        onActivateFile={onActivateFile}
        fileActions={fileActions}
        ariaLabel={ariaLabel}
        fillHeight={fillHeight}
        fileProgress={fileProgress}
        searchQuery={searchQuery}
        collapsedFoldersStorageKey={collapsedFoldersStorageKey}
      />
    );
  }

  return (
    <ProjectFilesTreeView
      files={files}
      selectedSourcePath={selectedSourcePath}
      onSelectFile={onSelectFile}
      onActivateFile={onActivateFile}
      ariaLabel={ariaLabel}
      fillHeight={fillHeight}
      fileProgress={fileProgress}
      searchQuery={searchQuery}
      collapsedFoldersStorageKey={collapsedFoldersStorageKey}
    />
  );
}

function ProjectFilesTreeView({
  files,
  selectedSourcePath,
  onSelectFile,
  onActivateFile,
  fileActions,
  ariaLabel,
  fillHeight = false,
  fileProgress = NO_FILE_PROGRESS,
  searchQuery,
  collapsedFoldersStorageKey,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  ariaLabel?: string;
  fillHeight?: boolean;
  fileProgress?: readonly ProjectFileProgressRecord[];
  searchQuery?: string;
  collapsedFoldersStorageKey?: string;
}) {
  const hasExternalSearch = searchQuery !== undefined;
  const intl = useIntl();
  const resolvedAriaLabel = ariaLabel ?? intl.formatMessage(messages.ariaLabel);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeStyle = useMemo(() => buildProjectFilesTreeStyle(fillHeight), [fillHeight]);
  const displayFiles = useMemo(() => dedupeProjectFilesBySourcePath(files), [files]);
  const paths = useMemo(() => displayFiles.map((file) => file.sourcePath), [displayFiles]);
  const pathsKey = useMemo(() => paths.join("\0"), [paths]);
  const fileByPath = useMemo(
    () => new Map(displayFiles.map((file) => [file.sourcePath, file])),
    [displayFiles],
  );
  const progressLookup = useMemo(
    () => buildProjectFileProgressLookup(fileProgress),
    [fileProgress],
  );
  const hiddenGitStatus = useMemo(
    () =>
      displayFiles.flatMap((file) =>
        file.isHidden ? [{ path: file.sourcePath, status: "ignored" as const }] : [],
      ),
    [displayFiles],
  );
  const selectedPaths =
    selectedSourcePath && fileByPath.has(selectedSourcePath) ? [selectedSourcePath] : [];
  const latestStateRef = useRef({
    fileActions,
    fileByPath,
    intl,
    onSelectFile,
    onActivateFile,
    progressLookup,
  });
  const [activeFileContextMenu, setActiveFileContextMenu] = useState<ActiveFileContextMenu | null>(
    null,
  );
  const contextMenuHandlersRef = useRef({
    onOpen: (_itemPath: string, _context: ContextMenuOpenContext) => {},
    onClose: () => {},
  });

  /**
   * Keep preload payload stable across parent re-renders that only change the
   * `files` array identity. Pierre's React host effect resets composition to the
   * model baseline whenever `preloadedData` changes; churning that object after
   * dialogs open left the "..." menu shell open with no React content.
   */
  const preloadedData = useMemo(() => {
    if (pathsKey.length === 0) {
      return null;
    }

    const nextPaths = pathsKey.split("\0");
    return preloadFileTree({
      id: "project-files-tree",
      initialExpansion: "open",
      paths: nextPaths,
      initialVisibleRowCount: Math.max(nextPaths.length, 8),
      icons: PROJECT_FILES_TREE_ICONS,
    });
  }, [pathsKey]);

  useEffect(() => {
    latestStateRef.current = {
      fileActions,
      fileByPath,
      intl,
      onActivateFile,
      onSelectFile,
      progressLookup,
    };
  }, [fileActions, fileByPath, intl, onActivateFile, onSelectFile, progressLookup]);

  contextMenuHandlersRef.current = {
    onOpen: (itemPath, context) => {
      if (!latestStateRef.current.fileActions) {
        context.close({ restoreFocus: false });
        return;
      }

      const file = latestStateRef.current.fileByPath.get(itemPath);
      if (!file) {
        context.close({ restoreFocus: false });
        return;
      }

      setActiveFileContextMenu({ file, context });
    },
    onClose: () => {
      setActiveFileContextMenu(null);
    },
  };

  useEffect(() => {
    if (!activeFileContextMenu) {
      return;
    }

    if (!fileActions || !fileByPath.has(activeFileContextMenu.file.sourcePath)) {
      activeFileContextMenu.context.close({ restoreFocus: false });
    }
  }, [activeFileContextMenu, fileActions, fileByPath]);

  useEffect(() => {
    if (!onActivateFile) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const pathElement = event
        .composedPath()
        .find(
          (node): node is HTMLElement =>
            node instanceof HTMLElement && typeof node.dataset.itemPath === "string",
        );
      const path = pathElement?.dataset.itemPath;
      if (!path || !latestStateRef.current.fileByPath.has(path)) {
        return;
      }

      latestStateRef.current.onActivateFile?.(path);
    };

    container.addEventListener("dblclick", handleDoubleClick);
    return () => container.removeEventListener("dblclick", handleDoubleClick);
  }, [onActivateFile]);

  /**
   * Own context-menu onOpen/onClose on the model baseline instead of
   * `renderContextMenu`. Pierre's React wrapper rewrites renderContextMenu
   * callbacks onto a composition object that is discarded whenever the host
   * effect re-runs (for example after preload identity churn). Baseline
   * callbacks survive that reset, so the "..." menu keeps rendering.
   */
  const { model } = useFileTree({
    id: "project-files-tree",
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPaths,
    initialVisibleRowCount: Math.max(paths.length, 8),
    icons: PROJECT_FILES_TREE_ICONS,
    paths,
    unsafeCSS: PROJECT_FILES_TREE_UNSAFE_CSS,
    search: !hasExternalSearch,
    searchBlurBehavior: "retain",
    fileTreeSearchMode: "hide-non-matches",
    composition: fileActions
      ? {
          contextMenu: {
            enabled: true,
            triggerMode: "button",
            buttonVisibility: "when-needed",
            onOpen: (item, context) => {
              if (item.kind !== "file") {
                context.close({ restoreFocus: false });
                return;
              }
              contextMenuHandlersRef.current.onOpen(item.path, context);
            },
            onClose: () => {
              contextMenuHandlersRef.current.onClose();
            },
          },
        }
      : undefined,
    renderRowDecoration: (context: FileTreeRowDecorationContext) => {
      if (context.item.kind !== "file") {
        return null;
      }

      const {
        fileByPath: files,
        intl: latestIntl,
        progressLookup: lookup,
      } = latestStateRef.current;
      const file = files.get(context.item.path);
      if (!file) {
        return null;
      }

      const progressDecoration = buildProjectFileProgressDecoration(
        file,
        findProjectFileProgress(lookup, file),
        latestIntl,
      );
      if (progressDecoration || file.provider) {
        return progressDecoration;
      }

      return {
        text: file.latestJob?.status ?? latestIntl.formatMessage(messages.uploaded),
        title: fileListMetadata(file, latestIntl),
      };
    },
    onSelectionChange: (nextSelectedPaths) => {
      const [nextPath] = nextSelectedPaths;
      if (!nextPath) {
        return;
      }

      if (latestStateRef.current.fileByPath.has(nextPath)) {
        latestStateRef.current.onSelectFile(nextPath);
      }
    },
  });

  const { preserveCollapsedFolders, restoreCollapsedFolders } = useProjectFilesTreeCollapsedFolders(
    model,
    collapsedFoldersStorageKey,
  );

  // Keyed on the path set, not array identity: each reset rebuilds the tree fully expanded.
  useEffect(() => {
    preserveCollapsedFolders(() => model.resetPaths(pathsKey ? pathsKey.split("\0") : []));
  }, [model, pathsKey, preserveCollapsedFolders]);

  useEffect(() => {
    if (searchQuery === undefined) {
      return;
    }

    const query = searchQuery.trim() || null;
    model.setSearch(query);
    if (!query) {
      restoreCollapsedFolders();
    }
  }, [model, pathsKey, searchQuery, restoreCollapsedFolders]);

  // Pierre's "ignored" git status dims the row name and icon, like gitignored files.
  useEffect(() => {
    model.setGitStatus(hiddenGitStatus.length > 0 ? hiddenGitStatus : undefined);
  }, [model, hiddenGitStatus]);

  // Pierre has no decoration refresh API; re-setting icons re-renders every row.
  useEffect(() => {
    model.setIcons(PROJECT_FILES_TREE_ICONS);
  }, [model, progressLookup]);

  useEffect(() => {
    if (!selectedSourcePath || !fileByPath.has(selectedSourcePath)) {
      return;
    }

    model.getItem(selectedSourcePath)?.select();
    model.scrollToPath(selectedSourcePath, { offset: "nearest" });
  }, [fileByPath, model, selectedSourcePath]);

  useEffect(() => {
    const host = containerRef.current?.querySelector("file-tree-container");
    const searchInput = host?.shadowRoot?.querySelector("[data-file-tree-search-input]");
    if (searchInput instanceof HTMLInputElement) {
      searchInput.setAttribute("aria-label", intl.formatMessage(messages.searchFiles));
    }
  }, [intl, model, paths.length]);

  if (paths.length === 0) {
    return null;
  }

  const activeMenuFile = activeFileContextMenu
    ? (fileByPath.get(activeFileContextMenu.file.sourcePath) ?? null)
    : null;
  const activeMenuCapabilities =
    activeMenuFile && fileActions
      ? buildProjectFileActionCapabilities({
          organizationSlug: fileActions.organizationSlug,
          projectId: fileActions.projectId,
          file: activeMenuFile,
          highlightLocale: fileActions.highlightLocale,
          projectTargetLocales: fileActions.projectTargetLocales,
          branch: fileActions.branch,
          intl,
        })
      : null;

  return (
    <div
      ref={containerRef}
      className={
        fillHeight ? "flex h-full min-h-0 w-full min-w-0 flex-col" : "flex w-full min-w-0 flex-col"
      }
    >
      <PierreFileTree
        aria-label={resolvedAriaLabel}
        className="w-full min-w-0 border-0 bg-transparent"
        id="project-files-tree"
        model={model}
        preloadedData={preloadedData ?? undefined}
        style={treeStyle}
      />
      {activeFileContextMenu && activeMenuFile && fileActions && activeMenuCapabilities ? (
        <ProjectFileTreeContextMenu
          file={activeMenuFile}
          context={activeFileContextMenu.context}
          fileActions={fileActions}
          capabilities={activeMenuCapabilities}
        />
      ) : null}
    </div>
  );
}
