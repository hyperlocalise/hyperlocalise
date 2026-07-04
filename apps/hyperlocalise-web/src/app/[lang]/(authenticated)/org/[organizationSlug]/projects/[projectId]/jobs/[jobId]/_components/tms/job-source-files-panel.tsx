"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4 } from "@/components/ui/typography";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";
import { toast } from "sonner";

import { ProjectFilesTree } from "../../../../files/_components/project-files-tree";

function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

function stringsHref(input: {
  organizationSlug: string;
  projectId: string;
  encodedJobId: string;
  targetLocale: string;
  sourcePath?: string;
  storedFileId?: string;
}) {
  const params = new URLSearchParams({
    targetLocale: input.targetLocale,
  });

  if (input.sourcePath) {
    params.set("sourcePath", input.sourcePath);
  }

  if (input.storedFileId) {
    params.set("storedFileId", input.storedFileId);
  }

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.encodedJobId)}/strings?${params.toString()}`;
}

function resolveTargetLocale(file: ProjectFileRecord, highlightLocale: string | null) {
  if (file.provider) {
    if (highlightLocale && file.provider.targetLocales?.includes(highlightLocale)) {
      return highlightLocale;
    }

    return file.provider.targetLocales?.[0] ?? highlightLocale;
  }

  return highlightLocale;
}

function canOpenFileInCat(
  file: ProjectFileRecord,
  sourcePath: string,
  encodedJobId: string | null | undefined,
  targetLocale: string | null,
) {
  if (!encodedJobId || !targetLocale) {
    return false;
  }

  const isProviderCatFile = supportsProviderCatFile(file);
  const isNativeCatFile = !file.provider && Boolean(file.storedFileId);

  if (isProviderCatFile) {
    return Boolean(sourcePath);
  }

  return isNativeCatFile;
}

function catOpenUnavailableMessage(targetLocale: string | null) {
  if (!targetLocale) {
    return "No target locale is available for this task file.";
  }

  return "This file can't be opened in the CAT workspace.";
}

export function JobSourceFilesPanel({
  organizationSlug,
  projectId,
  encodedJobId,
  files,
  isLoading,
  isError,
  errorMessage,
  emptyMessage = "No source files linked to this job.",
  highlightLocale = null,
  openInCatOnSelect = false,
}: {
  organizationSlug: string;
  projectId: string;
  encodedJobId?: string | null;
  files: ProjectFileRecord[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  highlightLocale?: string | null;
  openInCatOnSelect?: boolean;
}) {
  const router = useRouter();
  const sortedFiles = useMemo(() => sortFilesByPath(files), [files]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const selectedFile =
    sortedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? sortedFiles[0] ?? null;
  const activeSourcePath = selectedFile?.sourcePath ?? null;

  const handleSelectFile = useCallback(
    (sourcePath: string) => {
      setSelectedSourcePath(sourcePath);

      if (!openInCatOnSelect || !encodedJobId) {
        return;
      }

      const file = sortedFiles.find((entry) => entry.sourcePath === sourcePath);
      if (!file) {
        return;
      }

      const targetLocale = resolveTargetLocale(file, highlightLocale);
      if (!canOpenFileInCat(file, sourcePath, encodedJobId, targetLocale)) {
        toast.error(catOpenUnavailableMessage(targetLocale));
        return;
      }

      router.push(
        stringsHref({
          organizationSlug,
          projectId,
          encodedJobId,
          targetLocale: targetLocale as string,
          ...(supportsProviderCatFile(file)
            ? { sourcePath }
            : { storedFileId: file.storedFileId as string }),
        }),
      );
    },
    [
      encodedJobId,
      highlightLocale,
      openInCatOnSelect,
      organizationSlug,
      projectId,
      router,
      sortedFiles,
    ],
  );

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <TypographyH4>Source files</TypographyH4>

      {isLoading ? (
        <div className="mt-4">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">
          {errorMessage ?? "Unable to load source files."}
        </p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background p-2">
          <ProjectFilesTree
            ariaLabel="Job source files"
            files={sortedFiles}
            selectedSourcePath={activeSourcePath}
            onSelectFile={handleSelectFile}
          />
        </div>
      ) : null}
    </section>
  );
}
