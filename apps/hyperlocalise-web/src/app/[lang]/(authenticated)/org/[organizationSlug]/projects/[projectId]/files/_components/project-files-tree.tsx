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

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  ProjectFileTreeContextMenu,
  type ProjectFileTreeActionsConfig,
} from "./project-file-tree-context-menu";
import { projectFilesTreeMessages as messages } from "./project-files-tree.messages";
import { dedupeProjectFilesBySourcePath, formatBytes } from "./project-files-shared";
import { buildProjectFileActionCapabilities } from "./use-project-file-actions";

export const TREE_HEIGHT_PX = 480;

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
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  ariaLabel?: string;
  /** Stretch to the parent height instead of the fixed TREE_HEIGHT_PX. */
  fillHeight?: boolean;
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
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  ariaLabel?: string;
  fillHeight?: boolean;
}) {
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
  const selectedPaths =
    selectedSourcePath && fileByPath.has(selectedSourcePath) ? [selectedSourcePath] : [];
  const latestStateRef = useRef({
    fileActions,
    fileByPath,
    intl,
    onSelectFile,
    onActivateFile,
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
    });
  }, [pathsKey]);

  useEffect(() => {
    latestStateRef.current = {
      fileActions,
      fileByPath,
      intl,
      onActivateFile,
      onSelectFile,
    };
  }, [fileActions, fileByPath, intl, onActivateFile, onSelectFile]);

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
    paths,
    search: true,
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

      const file = latestStateRef.current.fileByPath.get(context.item.path);
      if (!file || file.provider) {
        return null;
      }

      return {
        text:
          file.latestJob?.status ?? latestStateRef.current.intl.formatMessage(messages.uploaded),
        title: fileListMetadata(file, latestStateRef.current.intl),
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

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

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
