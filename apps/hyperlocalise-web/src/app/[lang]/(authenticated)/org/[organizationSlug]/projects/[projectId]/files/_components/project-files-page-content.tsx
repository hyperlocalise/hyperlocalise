"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { File01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import {
  ProjectPageShell,
  ProjectSectionHeader,
  ProjectSectionTitle,
} from "../../_components/project-page-shell";
import { ProjectFileDetailPanel } from "./project-file-detail-panel";
import { ProjectFilesTree } from "./project-files-tree";
import { formatBytes } from "./project-files-shared";

const FILE_ACCEPT =
  ".json,.jsonc,.yaml,.yml,.arb,.xlf,.xlif,.xliff,.po,.html,.md,.mdx,.strings,.stringsdict,.xcstrings,.csv";
const MAX_UPLOAD_FILES = 10;

function projectFilesQueryKey(organizationSlug: string, projectId: string) {
  return ["project-files", organizationSlug, projectId] as const;
}

function apiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files`;
}

function sourcePathForFile(file: File) {
  const fileWithPath = file as File & { webkitRelativePath?: string };
  return fileWithPath.webkitRelativePath || file.name;
}

function fileKey(file: File) {
  return `${sourcePathForFile(file)}:${file.size}:${file.lastModified}`;
}

function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

export type ProjectFilesTreeRenderer = (props: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string | null) => void;
}) => ReactNode;

export type ProjectFilesDetailPanelRenderer = (props: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  requestedSourcePath: string | null;
  highlightLocale: string | null;
}) => ReactNode;

export type ProjectFilesErrorRenderer = (props: {
  organizationSlug: string;
  error: unknown;
}) => ReactNode;

function defaultRenderFilesTree({
  files,
  selectedSourcePath,
  onSelectFile,
}: Parameters<ProjectFilesTreeRenderer>[0]) {
  return (
    <ProjectFilesTree
      files={files}
      selectedSourcePath={selectedSourcePath}
      onSelectFile={onSelectFile}
    />
  );
}

function defaultRenderDetailPanel({
  organizationSlug,
  projectId,
  file,
  requestedSourcePath,
  highlightLocale,
}: Parameters<ProjectFilesDetailPanelRenderer>[0]) {
  return (
    <ProjectFileDetailPanel
      organizationSlug={organizationSlug}
      projectId={projectId}
      file={file}
      requestedSourcePath={requestedSourcePath}
      highlightLocale={highlightLocale}
    />
  );
}

function defaultRenderFilesError({
  organizationSlug,
  error,
}: Parameters<ProjectFilesErrorRenderer>[0]) {
  if (isTmsUserConnectionRequiredError(error)) {
    return (
      <TmsUserConnectionErrorPanel
        organizationSlug={organizationSlug}
        resource="files"
        error={error}
      />
    );
  }

  return (
    <>
      <TypographyP className="text-sm font-medium text-flame-100">
        Files failed to load.
      </TypographyP>
      <TypographyP className="mt-1 text-sm text-foreground/58">
        {error instanceof Error ? error.message : "Failed to load files."}
      </TypographyP>
    </>
  );
}

export function ProjectFilesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const selectedSourcePath = searchParams.get("sourcePath");
  const highlightLocale = searchParams.get("locale");

  const setSelectedSourcePath = useCallback(
    (sourcePath: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sourcePath) {
        params.set("sourcePath", sourcePath);
      } else {
        params.delete("sourcePath");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filesQuery = useQuery({
    queryKey: projectFilesQueryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await fetch(`${apiPath(organizationSlug, projectId)}?limit=500`, {
        method: "GET",
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load project files");
      }

      const body = (await response.json()) as { files: ProjectFileRecord[] };
      return body.files;
    },
  });

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("sourcePath", sourcePathForFile(file));

        const response = await fetch(apiPath(organizationSlug, projectId), {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw await readApiResponseError(response, `Failed to upload ${sourcePathForFile(file)}`);
        }
      }
    },
    onSuccess: async (_, files) => {
      const lastUploadedPath = files.at(-1) ? sourcePathForFile(files.at(-1) as File) : null;
      setSelectedFiles([]);
      await queryClient.invalidateQueries({
        queryKey: projectFilesQueryKey(organizationSlug, projectId),
      });
      if (lastUploadedPath) {
        setSelectedSourcePath(lastUploadedPath);
      }
      toast.success(files.length === 1 ? "File uploaded" : `${files.length} files uploaded`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to upload files");
    },
  });

  const files = useMemo(() => sortFilesByPath(filesQuery.data ?? []), [filesQuery.data]);
  const addSelectedFiles = useCallback((nextFiles: File[]) => {
    setSelectedFiles((currentFiles) => {
      const existing = new Set(currentFiles.map(fileKey));
      return [...currentFiles, ...nextFiles.filter((file) => !existing.has(fileKey(file)))].slice(
        0,
        MAX_UPLOAD_FILES,
      );
    });
  }, []);

  const removeSelectedFile = useCallback((file: File) => {
    setSelectedFiles((currentFiles) => currentFiles.filter((item) => item !== file));
  }, []);

  return (
    <ProjectFilesPageContentView
      organizationSlug={organizationSlug}
      projectId={projectId}
      files={files}
      isFilesLoading={filesQuery.isLoading}
      isFilesFetching={filesQuery.isFetching}
      filesError={filesQuery.isError ? filesQuery.error : undefined}
      selectedSourcePath={selectedSourcePath}
      highlightLocale={highlightLocale}
      selectedFiles={selectedFiles}
      isUploading={uploadFiles.isPending}
      onSelectSourcePath={setSelectedSourcePath}
      onAddSelectedFiles={addSelectedFiles}
      onRemoveSelectedFile={removeSelectedFile}
      onUploadSelectedFiles={() => uploadFiles.mutate(selectedFiles)}
    />
  );
}

export function ProjectFilesPageContentView({
  organizationSlug,
  projectId,
  files,
  isFilesLoading,
  isFilesFetching,
  filesError,
  selectedSourcePath,
  highlightLocale,
  selectedFiles,
  isUploading,
  onSelectSourcePath,
  onAddSelectedFiles,
  onRemoveSelectedFile,
  onUploadSelectedFiles,
  renderDetailPanel = defaultRenderDetailPanel,
  renderError = defaultRenderFilesError,
  renderFilesTree = defaultRenderFilesTree,
}: {
  organizationSlug: string;
  projectId: string;
  files: ProjectFileRecord[];
  isFilesLoading: boolean;
  isFilesFetching: boolean;
  filesError?: unknown;
  selectedSourcePath: string | null;
  highlightLocale: string | null;
  selectedFiles: File[];
  isUploading: boolean;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onAddSelectedFiles: (files: File[]) => void;
  onRemoveSelectedFile: (file: File) => void;
  onUploadSelectedFiles: () => void;
  renderDetailPanel?: ProjectFilesDetailPanelRenderer;
  renderError?: ProjectFilesErrorRenderer;
  renderFilesTree?: ProjectFilesTreeRenderer;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFile = useMemo(
    () => files.find((file) => file.sourcePath === selectedSourcePath) ?? null,
    [files, selectedSourcePath],
  );
  const isProviderProject =
    Boolean(parseProviderProjectId(projectId)) || files.some((file) => file.provider);
  const canUploadFiles = !isProviderProject;

  return (
    <ProjectPageShell className="gap-8">
      <ProjectSectionHeader
        icon={File01Icon}
        section="Files"
        description={
          isProviderProject
            ? "Browse source files from the connected TMS provider, then select one to preview its source content when the provider exposes it."
            : "Upload source files, then select one to inspect content and related translation jobs."
        }
        actions={
          canUploadFiles ? (
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
              Add files
            </Button>
          ) : null
        }
      />

      {canUploadFiles ? (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []);
            onAddSelectedFiles(nextFiles);
            event.currentTarget.value = "";
          }}
        />
      ) : null}

      {canUploadFiles && selectedFiles.length > 0 ? (
        <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <ProjectSectionTitle>Ready to upload</ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-foreground/52">
                {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected (max{" "}
                {MAX_UPLOAD_FILES}).
              </TypographyP>
            </div>
            <Button
              type="button"
              disabled={isUploading}
              onClick={onUploadSelectedFiles}
              className="w-full sm:w-fit"
            >
              {isUploading ? <Spinner /> : <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />}
              {isUploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-foreground/8 rounded-md border border-foreground/8 bg-background">
            {selectedFiles.map((file) => (
              <li key={fileKey(file)} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <TypographyP className="truncate font-mono text-sm text-foreground">
                    {sourcePathForFile(file)}
                  </TypographyP>
                  <TypographyP className="text-xs text-foreground/42">
                    {formatBytes(file.size)}
                  </TypographyP>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => onRemoveSelectedFile(file)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex min-h-[min(28rem,70vh)] flex-col overflow-hidden rounded-lg border border-foreground/8 bg-foreground/2.5">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3">
          <div>
            <ProjectSectionTitle>Project files</ProjectSectionTitle>
            <TypographyP className="mt-0.5 text-sm text-foreground/52">
              {isFilesLoading
                ? "Loading…"
                : filesError
                  ? "Could not load files"
                  : `${files.length} file${files.length === 1 ? "" : "s"}`}
            </TypographyP>
          </div>
          {isFilesFetching && !isFilesLoading ? <Spinner /> : null}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-foreground/8 lg:border-e">
            {isFilesLoading ? (
              <TypographyP className="p-4 text-sm text-foreground/52">Loading files…</TypographyP>
            ) : filesError ? (
              <div className="p-4">{renderError({ organizationSlug, error: filesError })}</div>
            ) : files.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">
                <TypographyP className="text-sm font-medium text-foreground">
                  No files yet
                </TypographyP>
                <TypographyP className="text-sm text-foreground/52">
                  {isProviderProject
                    ? "No provider files were found for this project."
                    : "Use Add files above to upload JSON, YAML, XLIFF, PO, and other supported formats."}
                </TypographyP>
              </div>
            ) : (
              <div className="min-h-0 flex-1 p-2">
                {renderFilesTree({
                  files,
                  selectedSourcePath,
                  onSelectFile: onSelectSourcePath,
                })}
              </div>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto bg-background/40">
            {renderDetailPanel({
              organizationSlug,
              projectId,
              file: selectedFile,
              requestedSourcePath: selectedSourcePath,
              highlightLocale,
            })}
          </main>
        </div>
      </section>
    </ProjectPageShell>
  );
}
