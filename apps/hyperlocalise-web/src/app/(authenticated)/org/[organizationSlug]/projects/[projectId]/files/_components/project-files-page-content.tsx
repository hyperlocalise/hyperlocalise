"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { File01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import { isTmsProviderShellModeEnabled } from "@/lib/providers/tms-provider-shell-mode";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import {
  ProjectPageShell,
  ProjectSectionHeader,
  ProjectSectionTitle,
} from "../../_components/project-page-shell";
import { ProjectFileDetailPanel } from "./project-file-detail-panel";
import { useActiveTmsProvider } from "../../../../_hooks/use-active-tms-provider";

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

async function readActionError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }
    if ("error" in body && typeof body.error === "string") {
      return body.error;
    }
  }

  return fallback;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown size";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unitIndex).toFixed(1))} ${units[unitIndex]}`;
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

function StatusBadge({ file }: { file: ProjectFileRecord }) {
  if (file.latestJob) {
    return (
      <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
        {file.latestJob.status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
      Uploaded
    </Badge>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const encodedProviderProject = parseProviderProjectId(projectId);
  const useLiveProviderFiles =
    isTmsProviderShellModeEnabled() &&
    Boolean(activeTmsProviderQuery.data) &&
    encodedProviderProject?.providerKind === activeTmsProviderQuery.data?.providerKind;

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
    queryKey: [
      ...projectFilesQueryKey(organizationSlug, projectId),
      useLiveProviderFiles ? "live" : "native",
      activeTmsProviderQuery.data?.providerKind ?? null,
    ],
    enabled: !encodedProviderProject || activeTmsProviderQuery.isFetched,
    queryFn: async () => {
      if (useLiveProviderFiles && encodedProviderProject) {
        const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
          ":externalProjectId"
        ].files.$get({
          param: {
            organizationSlug,
            externalProjectId: encodedProviderProject.externalProjectId,
          },
          query: { limit: "500" },
        });

        if (!response.ok) {
          throw new Error(`Failed to load provider files (${response.status})`);
        }

        const body = (await response.json()) as { files: ProjectFileRecord[] };
        return body.files;
      }

      const response = await fetch(`${apiPath(organizationSlug, projectId)}?limit=500`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(await readActionError(response, "Failed to load project files"));
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
          throw new Error(
            await readActionError(response, `Failed to upload ${sourcePathForFile(file)}`),
          );
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
  const canUploadFiles = !useLiveProviderFiles;

  return (
    <ProjectPageShell className="gap-8">
      <ProjectSectionHeader
        icon={File01Icon}
        section="Files"
        description={
          useLiveProviderFiles
            ? "Browse source files and keys from the connected TMS provider."
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
              <TypographyP className="p-4 text-sm text-flame-100">
                {filesQuery.error instanceof Error
                  ? filesQuery.error.message
                  : "Failed to load files."}
              </TypographyP>
            ) : files.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">
                <TypographyP className="text-sm font-medium text-foreground">
                  No files yet
                </TypographyP>
                <TypographyP className="text-sm text-foreground/52">
                  {useLiveProviderFiles
                    ? "No provider files or keys were found for this project."
                    : "Use Add files above to upload JSON, YAML, XLIFF, PO, and other supported formats."}
                </TypographyP>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <ul className="p-2" role="listbox" aria-label="Project files">
                  {files.map((file) => {
                    const isSelected = file.sourcePath === selectedSourcePath;

                    return (
                      <li key={`${file.sourcePath}:${file.uploadedAt}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => setSelectedSourcePath(file.sourcePath)}
                          className={cn(
                            "flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-start transition-colors",
                            isSelected
                              ? "bg-primary/12 text-foreground"
                              : "text-foreground/82 hover:bg-foreground/5",
                          )}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <TypographyP className="line-clamp-2 font-mono text-xs leading-snug font-medium">
                              {file.sourcePath}
                            </TypographyP>
                            <StatusBadge file={file} />
                          </div>
                          <TypographyP className="text-[11px] text-foreground/42">
                            {formatBytes(file.byteSize)} ·{" "}
                            {DATE_FORMATTER.format(new Date(file.uploadedAt))}
                          </TypographyP>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto bg-background/40">
            {useLiveProviderFiles ? (
              <div className="p-4">
                <ProjectSectionTitle>
                  {selectedFile ? selectedFile.sourcePath : "Select a file"}
                </ProjectSectionTitle>
                <TypographyP className="mt-2 text-sm text-foreground/52">
                  Provider file content and related job details are read live from the connected
                  TMS. Select Jobs to inspect provider tasks for this project.
                </TypographyP>
              </div>
            ) : (
              <ProjectFileDetailPanel
                organizationSlug={organizationSlug}
                projectId={projectId}
                file={selectedFile}
                requestedSourcePath={selectedSourcePath}
                highlightLocale={highlightLocale}
              />
            )}
          </main>
        </div>
      </section>
    </ProjectPageShell>
  );
}
