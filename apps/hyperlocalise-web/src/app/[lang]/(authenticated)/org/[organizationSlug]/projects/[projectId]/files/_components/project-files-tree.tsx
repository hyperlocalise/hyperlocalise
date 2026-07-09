"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FileTreeRowDecorationContext } from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import { preloadFileTree } from "@pierre/trees/ssr";
import "@pierre/trees/web-components";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Input } from "@/components/ui/input";

import { ProjectFileActionDialogs } from "./project-file-action-dialogs";
import {
  ProjectFileTreeContextMenu,
  type ProjectFileTreeActionsConfig,
} from "./project-file-tree-context-menu";
import { dedupeProjectFilesBySourcePath, formatBytes } from "./project-files-shared";
import { createProjectFileRecord } from "./project-files.fixture";
import { useProjectFileActions } from "./use-project-file-actions";

export const TREE_HEIGHT_PX = 480;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const projectFilesTreeStyle = {
  width: "100%",
  minWidth: "100%",
  height: `${TREE_HEIGHT_PX}px`,
  backgroundColor: "transparent",
  color: "var(--foreground)",
  borderColor: "var(--border)",
  "--trees-bg-override": "var(--background)",
  "--trees-bg-muted-override": "var(--muted)",
  "--trees-border-color-override": "var(--border)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-focus-ring-color-override": "var(--ring)",
  "--trees-selected-bg-override": "var(--muted)",
  "--trees-selected-fg-override": "var(--foreground)",
  "--trees-selected-focused-border-color-override": "var(--ring)",
} as CSSProperties;

function formatNullableDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function fileListMetadata(file: ProjectFileRecord) {
  const uploadedAt = formatNullableDate(file.uploadedAt);
  if (file.provider && file.byteSize === null) {
    return [
      file.provider.format,
      file.provider.resourceType === "file" ? "Provider file" : "Provider key",
      uploadedAt,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [formatBytes(file.byteSize), uploadedAt].filter(Boolean).join(" · ");
}

export function ProjectFilesTree({
  files,
  selectedSourcePath,
  onSelectFile,
  onActivateFile,
  fileActions,
  ariaLabel = "Project files",
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  ariaLabel?: string;
}) {
  if (fileActions) {
    return (
      <ProjectFilesTreeWithRowActions
        files={files}
        selectedSourcePath={selectedSourcePath}
        onSelectFile={onSelectFile}
        onActivateFile={onActivateFile}
        fileActions={fileActions}
        ariaLabel={ariaLabel}
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
    />
  );
}

function ProjectFilesTreeWithRowActions({
  files,
  selectedSourcePath,
  onSelectFile,
  onActivateFile,
  fileActions,
  ariaLabel,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions: ProjectFileTreeActionsConfig;
  ariaLabel: string;
}) {
  const [contextMenuFile, setContextMenuFile] = useState<ProjectFileRecord | null>(null);
  const displayFiles = useMemo(() => dedupeProjectFilesBySourcePath(files), [files]);
  const actionFile = contextMenuFile ?? displayFiles[0] ?? createProjectFileRecord();
  const contextMenuActions = useProjectFileActions({
    organizationSlug: fileActions.organizationSlug,
    projectId: fileActions.projectId,
    file: actionFile,
    highlightLocale: fileActions.highlightLocale,
    projectTargetLocales: fileActions.projectTargetLocales,
    sourceLocale: fileActions.sourceLocale,
    nativeSourcePaths: fileActions.nativeSourcePaths,
    branch: fileActions.branch,
  });

  return (
    <>
      {contextMenuFile ? (
        <ProjectFileActionDialogs file={contextMenuFile} actions={contextMenuActions} />
      ) : null}
      <ProjectFilesTreeView
        files={files}
        selectedSourcePath={selectedSourcePath}
        onSelectFile={onSelectFile}
        onActivateFile={onActivateFile}
        fileActions={fileActions}
        contextMenuActions={contextMenuActions}
        onContextMenuFileChange={setContextMenuFile}
        ariaLabel={ariaLabel}
      />
    </>
  );
}

function ProjectFilesTreeView({
  files,
  selectedSourcePath,
  onSelectFile,
  onActivateFile,
  fileActions,
  contextMenuActions,
  onContextMenuFileChange,
  ariaLabel = "Project files",
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  onActivateFile?: (sourcePath: string) => void;
  fileActions?: ProjectFileTreeActionsConfig;
  contextMenuActions?: ReturnType<typeof useProjectFileActions>;
  onContextMenuFileChange?: (file: ProjectFileRecord | null) => void;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayFiles = useMemo(() => dedupeProjectFilesBySourcePath(files), [files]);
  const paths = useMemo(() => displayFiles.map((file) => file.sourcePath), [displayFiles]);
  const fileByPath = useMemo(
    () => new Map(displayFiles.map((file) => [file.sourcePath, file])),
    [displayFiles],
  );
  const selectedPaths =
    selectedSourcePath && fileByPath.has(selectedSourcePath) ? [selectedSourcePath] : [];
  const latestStateRef = useRef({
    contextMenuActions,
    fileActions,
    fileByPath,
    onContextMenuFileChange,
    onSelectFile,
    onActivateFile,
  });
  const preloadedData = useMemo(
    () =>
      paths.length > 0
        ? preloadFileTree({
            id: "project-files-tree",
            initialExpansion: "open",
            paths,
            initialVisibleRowCount: Math.max(paths.length, 8),
          })
        : null,
    [paths],
  );

  useEffect(() => {
    latestStateRef.current = {
      contextMenuActions,
      fileActions,
      fileByPath,
      onContextMenuFileChange,
      onActivateFile,
      onSelectFile,
    };
  }, [
    contextMenuActions,
    fileActions,
    fileByPath,
    onContextMenuFileChange,
    onActivateFile,
    onSelectFile,
  ]);

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

  const { model } = useFileTree({
    id: "project-files-tree",
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPaths,
    initialVisibleRowCount: Math.max(paths.length, 8),
    paths,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    composition: fileActions
      ? {
          contextMenu: {
            enabled: true,
            triggerMode: "button",
            buttonVisibility: "when-needed",
            onOpen: (item) => {
              if (item.kind !== "file") {
                return;
              }

              const file = latestStateRef.current.fileByPath.get(item.path);
              if (file) {
                latestStateRef.current.onContextMenuFileChange?.(file);
              }
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
        text: file.latestJob?.status ?? "Uploaded",
        title: fileListMetadata(file),
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

  const search = useFileTreeSearch(model);

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

  if (paths.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="flex w-full min-w-0 flex-col gap-2">
      <div className="relative shrink-0">
        <HugeiconsIcon
          icon={SearchIcon}
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search.value}
          onChange={(event) => search.setValue(event.target.value)}
          placeholder="Search files..."
          aria-label="Search files"
          className="h-9 pl-9 font-mono text-xs"
        />
      </div>
      <PierreFileTree
        aria-label={ariaLabel}
        className="w-full min-w-0 border-0 bg-transparent"
        id="project-files-tree"
        model={model}
        preloadedData={preloadedData ?? undefined}
        renderContextMenu={
          fileActions
            ? (item, context) => {
                if (item.kind !== "file") {
                  return null;
                }

                const file = latestStateRef.current.fileByPath.get(item.path);
                const actions = latestStateRef.current.fileActions;
                const contextMenuActions = latestStateRef.current.contextMenuActions;
                if (!file || !actions || !contextMenuActions) {
                  return null;
                }

                return (
                  <ProjectFileTreeContextMenu
                    file={file}
                    context={context}
                    fileActions={actions}
                    actions={contextMenuActions}
                  />
                );
              }
            : undefined
        }
        style={projectFilesTreeStyle}
      />
    </div>
  );
}
