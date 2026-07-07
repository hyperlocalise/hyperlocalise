"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4, TypographyP } from "@/components/ui/typography";
import { supportsProviderCatFile } from "@/lib/providers/capabilities/provider-cat-capabilities";
import { jobCatQueueFilterParam } from "@/lib/projects/job-cat-routing";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
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
  queueFilter?: CatQueueFilter;
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

  if (input.queueFilter && input.queueFilter !== "all") {
    params.set(jobCatQueueFilterParam, input.queueFilter);
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
  queueFilter,
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
  queueFilter?: CatQueueFilter;
}) {
  const router = useRouter();
  const sortedFiles = useMemo(() => sortFilesByPath(files), [files]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const selectedFile =
    sortedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? sortedFiles[0] ?? null;
  const activeSourcePath = selectedFile?.sourcePath ?? null;

  const openFileInCat = useCallback(
    (sourcePath: string) => {
      if (!encodedJobId) {
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
          queueFilter,
          ...(supportsProviderCatFile(file)
            ? { sourcePath }
            : { storedFileId: file.storedFileId as string }),
        }),
      );
    },
    [encodedJobId, highlightLocale, organizationSlug, projectId, queueFilter, router, sortedFiles],
  );

  const handleSelectFile = useCallback((sourcePath: string) => {
    setSelectedSourcePath(sourcePath);
  }, []);

  const selectedTargetLocale = selectedFile
    ? resolveTargetLocale(selectedFile, highlightLocale)
    : null;
  const canViewStrings = Boolean(
    selectedFile &&
    activeSourcePath &&
    canOpenFileInCat(selectedFile, activeSourcePath, encodedJobId, selectedTargetLocale),
  );
  const stringsHrefForSelected =
    canViewStrings && selectedFile && activeSourcePath && encodedJobId && selectedTargetLocale
      ? stringsHref({
          organizationSlug,
          projectId,
          encodedJobId,
          targetLocale: selectedTargetLocale,
          queueFilter,
          ...(supportsProviderCatFile(selectedFile)
            ? { sourcePath: activeSourcePath }
            : { storedFileId: selectedFile.storedFileId as string }),
        })
      : null;

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
        <div className="mt-4 space-y-2">
          {encodedJobId ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <TypographyP className="truncate font-mono text-xs text-foreground">
                  {selectedFile?.sourcePath}
                </TypographyP>
                <TypographyP className="text-xs text-muted-foreground">
                  {selectedTargetLocale
                    ? `Double-click a file or use View strings to open the CAT workspace for ${selectedTargetLocale}.`
                    : "No target locale is available for this task file."}
                </TypographyP>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={!stringsHrefForSelected}
                render={stringsHrefForSelected ? <Link href={stringsHrefForSelected} /> : undefined}
              >
                <ListIcon />
                View strings
              </Button>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border bg-background p-2">
            <ProjectFilesTree
              ariaLabel="Job source files"
              files={sortedFiles}
              selectedSourcePath={activeSourcePath}
              onSelectFile={handleSelectFile}
              onActivateFile={encodedJobId ? openFileInCat : undefined}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
