"use client";

import { useMemo, useState } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4 } from "@/components/ui/typography";

import { ProjectFilesTree } from "../../../../files/_components/project-files-tree";
import { ProjectFileDetailPanel } from "../../../../files/_components/project-file-detail-panel";

function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
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
  canFindInRepo = false,
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
  canFindInRepo?: boolean;
  highlightLocale?: string | null;
}) {
  const sortedFiles = useMemo(() => sortFilesByPath(files), [files]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const selectedFile =
    sortedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? sortedFiles[0] ?? null;
  const activeSourcePath = selectedFile?.sourcePath ?? null;

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
            <ProjectFileDetailPanel
              organizationSlug={organizationSlug}
              projectId={projectId}
              encodedJobId={encodedJobId}
              file={selectedFile}
              requestedSourcePath={activeSourcePath}
              highlightLocale={highlightLocale}
              canFindInRepo={canFindInRepo}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
