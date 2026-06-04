"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FileTreeRowDecorationContext } from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { File01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection";
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

const FILE_ACCEPT =
  ".json,.jsonc,.yaml,.yml,.arb,.xlf,.xlif,.xliff,.po,.html,.md,.mdx,.strings,.stringsdict,.xcstrings,.csv";
const MAX_UPLOAD_FILES = 10;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function projectFilesQueryKey(organizationSlug: string, projectId: string) {
  return ["project-files", organizationSlug, projectId] as const;
}

function apiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files`;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown size";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unitIndex).toFixed(1))} ${units[unitIndex]}`;
}

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

function ProjectFilesTree({
  files,
  selectedSourcePath,
  onSelectFile,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
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

      if (file.provider) {
        return {
          text: file.provider.syncState,
          title: fileListMetadata(file),
        };
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
      aria-label="Project files"
      className="h-full min-h-0 border-0 bg-transparent"
      model={model}
      style={{ height: "100%", minHeight: 0 }}
    />
  );
}

export function ProjectFilesPageContent({
  organizationSlug,
  projectId,
  canFindInRepo,
}: {
  organizationSlug: string;
  projectId: string;
  canFindInRepo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
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
  const selectedFile = useMemo(
    () => files.find((file) => file.sourcePath === selectedSourcePath) ?? null,
    [files, selectedSourcePath],
  );
  const isUploading = uploadFiles.isPending;
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
            setSelectedFiles((currentFiles) => {
              const existing = new Set(currentFiles.map(fileKey));
              return [
                ...currentFiles,
                ...nextFiles.filter((file) => !existing.has(fileKey(file))),
              ].slice(0, MAX_UPLOAD_FILES);
            });
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
              onClick={() => uploadFiles.mutate(selectedFiles)}
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
                  onClick={() =>
                    setSelectedFiles((currentFiles) => currentFiles.filter((item) => item !== file))
                  }
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
              {filesQuery.isLoading
                ? "Loading…"
                : filesQuery.isError
                  ? "Could not load files"
                  : `${files.length} file${files.length === 1 ? "" : "s"}`}
            </TypographyP>
          </div>
          {filesQuery.isFetching && !filesQuery.isLoading ? <Spinner /> : null}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-foreground/8 lg:border-e">
            {filesQuery.isLoading ? (
              <TypographyP className="p-4 text-sm text-foreground/52">Loading files…</TypographyP>
            ) : filesQuery.isError ? (
              <div className="p-4">
                {isTmsUserConnectionRequiredError(filesQuery.error) ? (
                  <TmsUserConnectionErrorPanel
                    organizationSlug={organizationSlug}
                    resource="files"
                    error={filesQuery.error}
                  />
                ) : (
                  <>
                    <TypographyP className="text-sm font-medium text-flame-100">
                      Files failed to load.
                    </TypographyP>
                    <TypographyP className="mt-1 text-sm text-foreground/58">
                      {filesQuery.error instanceof Error
                        ? filesQuery.error.message
                        : "Failed to load files."}
                    </TypographyP>
                  </>
                )}
              </div>
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
                <ProjectFilesTree
                  files={files}
                  selectedSourcePath={selectedSourcePath}
                  onSelectFile={setSelectedSourcePath}
                />
              </div>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto bg-background/40">
            <ProjectFileDetailPanel
              organizationSlug={organizationSlug}
              projectId={projectId}
              file={selectedFile}
              requestedSourcePath={selectedSourcePath}
              highlightLocale={highlightLocale}
              canFindInRepo={canFindInRepo}
            />
          </main>
        </div>
      </section>
    </ProjectPageShell>
  );
}
