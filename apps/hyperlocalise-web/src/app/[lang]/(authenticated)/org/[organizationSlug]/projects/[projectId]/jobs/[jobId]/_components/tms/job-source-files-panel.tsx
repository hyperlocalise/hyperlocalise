"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4, TypographyP } from "@/components/ui/typography";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";

import { ProjectFilesTree } from "../../../../files/_components/project-files-tree";
import { ProjectFileDetailPanel } from "../../../../files/_components/project-file-detail-panel";

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
}) {
  const sortedFiles = useMemo(() => sortFilesByPath(files), [files]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const selectedFile =
    sortedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? sortedFiles[0] ?? null;
  const activeSourcePath = selectedFile?.sourcePath ?? null;
  const targetLocale = selectedFile?.provider
    ? highlightLocale && selectedFile.provider.targetLocales?.includes(highlightLocale)
      ? highlightLocale
      : (selectedFile.provider.targetLocales?.[0] ?? highlightLocale)
    : highlightLocale;
  const isProviderCatFile = Boolean(selectedFile && supportsProviderCatFile(selectedFile));
  const isNativeCatFile = Boolean(
    selectedFile && !selectedFile.provider && selectedFile.storedFileId,
  );
  const canViewStrings = Boolean(
    encodedJobId &&
    selectedFile &&
    targetLocale &&
    ((isProviderCatFile && activeSourcePath) || isNativeCatFile),
  );
  const showStringsAction = isProviderCatFile || isNativeCatFile;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <TypographyH4>Source files</TypographyH4>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
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
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <aside className="min-h-80 border-b border-border p-2 lg:border-r lg:border-b-0">
            <ProjectFilesTree
              ariaLabel="Job source files"
              files={sortedFiles}
              selectedSourcePath={activeSourcePath}
              onSelectFile={setSelectedSourcePath}
            />
          </aside>
          <div className="min-h-[min(20rem,50vh)] overflow-y-auto">
            {showStringsAction ? (
              <div className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <TypographyP className="font-mono text-xs text-foreground">
                    {selectedFile?.sourcePath}
                  </TypographyP>
                  <TypographyP className="text-xs text-muted-foreground">
                    {targetLocale
                      ? `Edit ${targetLocale} strings in the CAT workspace.`
                      : "No target locale is available for this task file."}
                  </TypographyP>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canViewStrings}
                  render={
                    canViewStrings ? (
                      <Link
                        href={stringsHref({
                          organizationSlug,
                          projectId,
                          encodedJobId: encodedJobId as string,
                          targetLocale: targetLocale as string,
                          ...(isProviderCatFile
                            ? { sourcePath: activeSourcePath as string }
                            : { storedFileId: selectedFile?.storedFileId as string }),
                        })}
                      />
                    ) : undefined
                  }
                >
                  <ListIcon />
                  View strings
                </Button>
              </div>
            ) : null}
            <ProjectFileDetailPanel
              organizationSlug={organizationSlug}
              projectId={projectId}
              encodedJobId={encodedJobId}
              file={selectedFile}
              requestedSourcePath={activeSourcePath}
              highlightLocale={highlightLocale}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
