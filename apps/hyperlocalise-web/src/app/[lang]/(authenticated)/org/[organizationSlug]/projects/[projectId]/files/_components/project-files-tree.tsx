"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { FileTreeRowDecorationContext } from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  resolveFileLocaleReadiness,
  summarizeNativeLocaleReadiness,
} from "@/lib/projects/files/native-locale-readiness";
import { summarizeLocaleReadiness } from "../../../../_components/workspace-files-shared";
import { formatBytes } from "./project-files-shared";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const projectFilesTreeStyle = {
  height: "100%",
  minHeight: 0,
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
  ariaLabel = "Project files",
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  ariaLabel?: string;
}) {
  const paths = useMemo(() => files.map((file) => file.sourcePath), [files]);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.sourcePath, file])), [files]);
  const selectedPaths =
    selectedSourcePath && fileByPath.has(selectedSourcePath) ? [selectedSourcePath] : [];
  const latestStateRef = useRef({ fileByPath, onSelectFile });

  useEffect(() => {
    latestStateRef.current = { fileByPath, onSelectFile };
  }, [fileByPath, onSelectFile]);

  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPaths,
    paths,
    renderRowDecoration: (context: FileTreeRowDecorationContext) => {
      if (context.item.kind !== "file") {
        return null;
      }

      const file = latestStateRef.current.fileByPath.get(context.item.path);
      if (!file) {
        return null;
      }

      const localeReadiness = resolveFileLocaleReadiness(file);
      const readinessSummary =
        summarizeLocaleReadiness(localeReadiness) ??
        summarizeNativeLocaleReadiness(localeReadiness, Object.keys(localeReadiness).length);

      if (readinessSummary) {
        return {
          text: readinessSummary,
          title: fileListMetadata(file),
        };
      }

      if (file.provider) {
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

  return (
    <PierreFileTree
      aria-label={ariaLabel}
      className="h-full min-h-0 border-0 bg-transparent"
      model={model}
      style={projectFilesTreeStyle}
    />
  );
}
