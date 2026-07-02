"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { getProjectWorkspaceCapabilities } from "@/lib/projects/workspace-resource-capabilities";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { ProjectFilesErrorBoundary } from "./project-files-error-boundary";
import { ProjectFilesTree } from "./project-files-tree";

export const PROJECT_FILES_PAGE_SIZE = 50;
export const PROJECT_FILES_MAX_LIMIT = 1_000;

export function projectFilesQueryKey(organizationSlug: string, projectId: string, limit?: number) {
  return limit === undefined
    ? (["project-files", organizationSlug, projectId] as const)
    : (["project-files", organizationSlug, projectId, limit] as const);
}

export async function fetchProjectFiles(
  organizationSlug: string,
  projectId: string,
  limit: number = PROJECT_FILES_PAGE_SIZE,
) {
  const response = await fetch(`${apiPath(organizationSlug, projectId)}?limit=${limit}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load project files");
  }

  const body = (await response.json()) as { files: ProjectFileRecord[] };
  return body.files;
}

function apiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files`;
}

export function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

function ProjectFilesTreeBody({
  projectId,
  files,
  selectedSourcePath,
  onSelectSourcePath,
}: {
  projectId: string;
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
}) {
  const projectCapabilities = getProjectWorkspaceCapabilities({ projectId });
  const isProviderProject = projectCapabilities.isProviderProject;

  if (files.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <TypographyP className="text-sm font-medium text-foreground">No files yet</TypographyP>
        <TypographyP className="text-sm text-foreground/52">
          {isProviderProject
            ? "No provider files were found for this project."
            : "Use Add files above to upload JSON, YAML, XLIFF, PO, and other supported formats."}
        </TypographyP>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 p-2">
      <ProjectFilesTree
        files={files}
        selectedSourcePath={selectedSourcePath}
        onSelectFile={onSelectSourcePath}
      />
    </div>
  );
}

function ProjectFilesTreeQueryResult({
  error,
  projectId,
  files,
  selectedSourcePath,
  onSelectSourcePath,
}: {
  error: unknown;
  projectId: string;
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
}) {
  if (error) {
    throw error;
  }

  return (
    <ProjectFilesTreeBody
      projectId={projectId}
      files={files}
      selectedSourcePath={selectedSourcePath}
      onSelectSourcePath={onSelectSourcePath}
    />
  );
}

export function ProjectFilesTreePanel({
  organizationSlug,
  projectId,
  selectedSourcePath,
  onSelectSourcePath,
  onLoadedFilesChange,
}: {
  organizationSlug: string;
  projectId: string;
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onLoadedFilesChange?: (files: ProjectFileRecord[]) => void;
}) {
  const queryClient = useQueryClient();
  const [fileLimit, setFileLimit] = useState(PROJECT_FILES_PAGE_SIZE);
  const queryKey = projectFilesQueryKey(organizationSlug, projectId, fileLimit);
  const filesQuery = useQuery({
    queryKey,
    queryFn: () => fetchProjectFiles(organizationSlug, projectId, fileLimit),
  });

  const files = useMemo(() => sortFilesByPath(filesQuery.data ?? []), [filesQuery.data]);
  const hasMoreFiles = files.length >= fileLimit && fileLimit < PROJECT_FILES_MAX_LIMIT;

  useEffect(() => {
    onLoadedFilesChange?.(files);
  }, [files, onLoadedFilesChange]);

  useEffect(() => {
    if (!selectedSourcePath || filesQuery.isLoading || filesQuery.isFetching) {
      return;
    }

    const selectedFileLoaded = files.some((file) => file.sourcePath === selectedSourcePath);
    if (!selectedFileLoaded && hasMoreFiles) {
      setFileLimit((currentLimit) =>
        Math.min(currentLimit + PROJECT_FILES_PAGE_SIZE, PROJECT_FILES_MAX_LIMIT),
      );
    }
  }, [files, filesQuery.isFetching, filesQuery.isLoading, hasMoreFiles, selectedSourcePath]);

  const invalidateFiles = () => {
    void queryClient.invalidateQueries({
      queryKey: projectFilesQueryKey(organizationSlug, projectId),
    });
  };

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3">
        <div>
          <ProjectSectionTitle>Project files</ProjectSectionTitle>
          <TypographyP className="mt-0.5 text-sm text-foreground/52">
            {filesQuery.isLoading
              ? "Loading…"
              : filesQuery.isError
                ? "Could not load files"
                : hasMoreFiles
                  ? `${files.length}+ files`
                  : `${files.length} file${files.length === 1 ? "" : "s"}`}
          </TypographyP>
        </div>
        {filesQuery.isFetching && !filesQuery.isLoading ? <Spinner /> : null}
      </header>

      {filesQuery.isLoading ? (
        <TypographyP className="p-4 text-sm text-foreground/52">Loading files…</TypographyP>
      ) : (
        <ProjectFilesErrorBoundary
          organizationSlug={organizationSlug}
          scope="tree"
          resetKeys={queryKey}
          onReset={invalidateFiles}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ProjectFilesTreeQueryResult
            error={filesQuery.isError ? filesQuery.error : null}
            projectId={projectId}
            files={files}
            selectedSourcePath={selectedSourcePath}
            onSelectSourcePath={onSelectSourcePath}
          />
          {hasMoreFiles ? (
            <div className="shrink-0 border-t border-foreground/8 p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={filesQuery.isFetching}
                onClick={() => {
                  setFileLimit((currentLimit) =>
                    Math.min(currentLimit + PROJECT_FILES_PAGE_SIZE, PROJECT_FILES_MAX_LIMIT),
                  );
                }}
              >
                {filesQuery.isFetching ? (
                  <>
                    <Spinner />
                    Loading more…
                  </>
                ) : (
                  "Load more files"
                )}
              </Button>
            </div>
          ) : null}
        </ProjectFilesErrorBoundary>
      )}
    </>
  );
}
