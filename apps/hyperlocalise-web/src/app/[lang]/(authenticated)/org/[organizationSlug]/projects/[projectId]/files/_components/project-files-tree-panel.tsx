"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
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
import { dedupeProjectFilesBySourcePath } from "./project-files-shared";

export const PROJECT_FILES_PAGE_SIZE = 500;
export const PROJECT_FILES_MAX_LIMIT = 1_000;

export function projectFilesQueryKey(
  organizationSlug: string,
  projectId: string,
  limit?: number,
  branch?: string | null,
) {
  const branchKey = branch?.trim() ? branch.trim() : null;
  if (limit === undefined) {
    return branchKey
      ? (["project-files", organizationSlug, projectId, branchKey] as const)
      : (["project-files", organizationSlug, projectId] as const);
  }

  return branchKey
    ? (["project-files", organizationSlug, projectId, branchKey, limit] as const)
    : (["project-files", organizationSlug, projectId, limit] as const);
}

export function findCachedProjectFiles(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
  branch?: string | null,
): ProjectFileRecord[] | undefined {
  const exactKey = projectFilesQueryKey(organizationSlug, projectId, undefined, branch ?? null);
  const exact = queryClient.getQueryData<ProjectFileRecord[]>(exactKey);
  if (exact?.length) {
    return exact;
  }

  const prefix = ["project-files", organizationSlug, projectId] as const;
  const entries = queryClient.getQueriesData<ProjectFileRecord[]>({ queryKey: prefix });
  let best: ProjectFileRecord[] | undefined;

  for (const [, data] of entries) {
    if (!data?.length) {
      continue;
    }

    if (!best || data.length > best.length) {
      best = data;
    }
  }

  return best;
}

export async function fetchProjectFiles(
  organizationSlug: string,
  projectId: string,
  limit: number = PROJECT_FILES_PAGE_SIZE,
  branch?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  const trimmedBranch = branch?.trim();
  if (trimmedBranch) {
    params.set("branch", trimmedBranch);
  }

  const response = await fetch(`${apiPath(organizationSlug, projectId)}?${params.toString()}`, {
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
  return dedupeProjectFilesBySourcePath(files).toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

function ProjectFilesTreeBody({
  projectId,
  files,
  selectedSourcePath,
  onSelectSourcePath,
  onActivateFile,
  catOpenHint,
}: {
  projectId: string;
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onActivateFile?: (sourcePath: string) => void;
  catOpenHint?: string | null;
}) {
  const projectCapabilities = getProjectWorkspaceCapabilities({ projectId });
  const isProviderProject = projectCapabilities.isProviderProject;

  if (files.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <TypographyP className="text-sm font-medium text-foreground">No files yet</TypographyP>
        <TypographyP className="text-sm text-muted-foreground">
          {isProviderProject
            ? "No provider files were found for this project."
            : "Use Add files above to upload JSON, YAML, XLIFF, PO, and other supported formats."}
        </TypographyP>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {onActivateFile && selectedSourcePath && catOpenHint ? (
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <TypographyP className="truncate font-mono text-xs text-foreground">
            {selectedSourcePath}
          </TypographyP>
          <TypographyP className="text-xs text-muted-foreground">{catOpenHint}</TypographyP>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ProjectFilesTree
          files={files}
          selectedSourcePath={selectedSourcePath}
          onSelectFile={onSelectSourcePath}
          onActivateFile={onActivateFile}
        />
      </div>
    </div>
  );
}

function ProjectFilesTreeQueryResult({
  error,
  projectId,
  files,
  selectedSourcePath,
  onSelectSourcePath,
  onActivateFile,
  catOpenHint,
}: {
  error: unknown;
  projectId: string;
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onActivateFile?: (sourcePath: string) => void;
  catOpenHint?: string | null;
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
      onActivateFile={onActivateFile}
      catOpenHint={catOpenHint}
    />
  );
}

export function ProjectFilesTreePanel({
  organizationSlug,
  projectId,
  selectedSourcePath,
  onSelectSourcePath,
  onLoadedFilesChange,
  onActivateFile,
  catOpenHint = null,
  headerActions,
  branch = null,
}: {
  organizationSlug: string;
  projectId: string;
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onLoadedFilesChange?: (files: ProjectFileRecord[]) => void;
  onActivateFile?: (sourcePath: string) => void;
  catOpenHint?: string | null;
  headerActions?: ReactNode;
  branch?: string | null;
}) {
  const queryClient = useQueryClient();
  const [fileLimit, setFileLimit] = useState(PROJECT_FILES_PAGE_SIZE);
  const [autoAdvanceExhausted, setAutoAdvanceExhausted] = useState(false);
  const fetchLimit = Math.min(fileLimit + 1, PROJECT_FILES_MAX_LIMIT);
  const queryKey = projectFilesQueryKey(organizationSlug, projectId, fetchLimit, branch);
  const filesQuery = useQuery({
    queryKey,
    queryFn: () => fetchProjectFiles(organizationSlug, projectId, fetchLimit, branch),
    placeholderData: () => findCachedProjectFiles(queryClient, organizationSlug, projectId, branch),
  });

  const fetchedFiles = filesQuery.data ?? [];
  const hasMoreFiles = fetchedFiles.length > fileLimit && fileLimit < PROJECT_FILES_MAX_LIMIT;
  const files = useMemo(
    () => sortFilesByPath(fetchedFiles.slice(0, fileLimit)),
    [fetchedFiles, fileLimit],
  );

  useEffect(() => {
    setAutoAdvanceExhausted(false);
    setFileLimit(PROJECT_FILES_PAGE_SIZE);
  }, [branch, selectedSourcePath]);

  useEffect(() => {
    onLoadedFilesChange?.(files);
  }, [files, onLoadedFilesChange]);

  useEffect(() => {
    if (
      autoAdvanceExhausted ||
      !selectedSourcePath ||
      filesQuery.isLoading ||
      filesQuery.isFetching
    ) {
      return;
    }

    const selectedFileLoaded = files.some((file) => file.sourcePath === selectedSourcePath);
    if (selectedFileLoaded) {
      return;
    }

    if (!hasMoreFiles || fileLimit >= PROJECT_FILES_MAX_LIMIT) {
      setAutoAdvanceExhausted(true);
      return;
    }

    setFileLimit((currentLimit) =>
      Math.min(currentLimit + PROJECT_FILES_PAGE_SIZE, PROJECT_FILES_MAX_LIMIT),
    );
  }, [
    autoAdvanceExhausted,
    fileLimit,
    files,
    filesQuery.isFetching,
    filesQuery.isLoading,
    hasMoreFiles,
    selectedSourcePath,
  ]);

  const invalidateFiles = () => {
    void queryClient.invalidateQueries({
      queryKey: projectFilesQueryKey(organizationSlug, projectId),
    });
  };

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <ProjectSectionTitle>Project files</ProjectSectionTitle>
          <TypographyP className="mt-0.5 text-sm text-muted-foreground">
            {filesQuery.isLoading
              ? "Loading…"
              : filesQuery.isError
                ? "Could not load files"
                : hasMoreFiles
                  ? `${files.length}+ files`
                  : `${files.length} file${files.length === 1 ? "" : "s"}`}
          </TypographyP>
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {headerActions}
          </div>
        ) : filesQuery.isFetching && !filesQuery.isLoading ? (
          <Spinner />
        ) : null}
      </header>

      {filesQuery.isLoading ? (
        <TypographyP className="p-4 text-sm text-muted-foreground">Loading files…</TypographyP>
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
            onActivateFile={onActivateFile}
            catOpenHint={catOpenHint}
          />
          {hasMoreFiles ? (
            <div className="shrink-0 border-t border-border p-2">
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
