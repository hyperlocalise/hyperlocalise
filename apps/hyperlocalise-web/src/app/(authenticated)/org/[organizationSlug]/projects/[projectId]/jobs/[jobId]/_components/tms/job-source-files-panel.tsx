"use client";

import { useMemo, useState } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

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
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Source files
      </TypographyH2>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full bg-foreground/8" />
          <Skeleton className="h-48 w-full bg-foreground/8" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">
          {errorMessage ?? "Unable to load source files."}
        </p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/48">{emptyMessage}</p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-foreground/8 bg-background/40 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <ul className="max-h-[min(28rem,60vh)] divide-y divide-foreground/8 overflow-y-auto border-b border-foreground/8 lg:border-r lg:border-b-0">
            {sortedFiles.map((file) => {
              const isSelected = file.sourcePath === activeSourcePath;

              return (
                <li key={file.sourcePath}>
                  <button
                    type="button"
                    onClick={() => setSelectedSourcePath(file.sourcePath)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-foreground/4",
                      isSelected && "bg-primary/8",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-foreground/82">
                      {file.filename}
                    </span>
                    <span className="truncate font-mono text-xs text-foreground/48">
                      {file.sourcePath}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

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
