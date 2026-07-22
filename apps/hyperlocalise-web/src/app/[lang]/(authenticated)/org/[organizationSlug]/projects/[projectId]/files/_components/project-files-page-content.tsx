"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { File01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormattedMessage, useIntl } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { getProjectWorkspaceCapabilities } from "@/lib/projects/workspace-resource-capabilities";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
  resolveProjectFileCatTargetLocaleResolution,
} from "@/lib/projects/project-file-cat-routing";

import {
  ProjectPageShell,
  ProjectSectionHeader,
  ProjectSectionTitle,
  useProjectPageQuery,
} from "../../_components/project-page-shell";
import { ProjectFileActionDialogs } from "./project-file-action-dialogs";
import type { ProjectFileTreeActionsConfig } from "./project-file-tree-context-menu";
import { ProjectFilesBranchFilter } from "./project-files-branch-filter";
import {
  ProjectFilesTreePanel,
  projectFilesQueryKey,
  sortFilesByPath,
} from "./project-files-tree-panel";
import { ProjectFilesTree } from "./project-files-tree";
import { formatBytes } from "./project-files-shared";
import { projectFilesPageContentMessages as messages } from "./project-files-page-content.messages";
import { useProjectFileActions } from "./use-project-file-actions";

const FILE_ACCEPT =
  ".json,.jsonc,.yaml,.yml,.arb,.xlf,.xlif,.xliff,.po,.html,.md,.mdx,.strings,.stringsdict,.xcstrings,.csv";
const MAX_UPLOAD_FILES = 10;

type PendingFileDialogAction = "translate" | "import" | "download";

function ProjectFileDialogHost({
  file,
  initialAction,
  organizationSlug,
  projectId,
  highlightLocale,
  projectTargetLocales,
  sourceLocale,
  nativeSourcePaths,
  branch,
  onClose,
}: {
  file: ProjectFileRecord;
  initialAction: PendingFileDialogAction;
  organizationSlug: string;
  projectId: string;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  sourceLocale: string;
  nativeSourcePaths: readonly string[];
  branch: string | null;
  onClose: () => void;
}) {
  const actions = useProjectFileActions({
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    projectTargetLocales,
    sourceLocale,
    nativeSourcePaths,
    branch,
  });
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (hasOpened) {
      return;
    }
    const openDialog = {
      translate: () => actions.setTranslateDialogOpen(true),
      import: () => actions.setImportDialogOpen(true),
      download: () => actions.setDownloadDialogOpen(true),
    }[initialAction];
    openDialog();
    setHasOpened(true);
  }, [actions, hasOpened, initialAction]);

  useEffect(() => {
    if (!hasOpened) {
      return;
    }

    const anyOpen =
      actions.translateDialogOpen || actions.importDialogOpen || actions.downloadDialogOpen;
    if (!anyOpen) {
      onClose();
    }
  }, [
    actions.downloadDialogOpen,
    actions.importDialogOpen,
    actions.translateDialogOpen,
    hasOpened,
    onClose,
  ]);

  return <ProjectFileActionDialogs file={file} actions={actions} />;
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

export type ProjectFilesTreeRenderer = (props: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string | null) => void;
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

function DefaultRenderFilesError({
  organizationSlug,
  error,
}: Parameters<ProjectFilesErrorRenderer>[0]) {
  const intl = useIntl();

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
        <FormattedMessage {...messages.filesFailedToLoad} />
      </TypographyP>
      <TypographyP className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : intl.formatMessage(messages.loadFailedFallback)}
      </TypographyP>
    </>
  );
}

function defaultRenderFilesError(props: Parameters<ProjectFilesErrorRenderer>[0]) {
  return <DefaultRenderFilesError {...props} />;
}

export function ProjectFilesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<ProjectFileRecord[]>([]);

  const selectedSourcePath = searchParams.get("sourcePath");
  const highlightLocale = searchParams.get("locale");
  const selectedBranch = searchParams.get("branch");

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

  const setSelectedBranch = useCallback(
    (branch: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (branch) {
        params.set("branch", branch);
      } else {
        params.delete("branch");
      }
      params.delete("sourcePath");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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
          throw await readApiResponseError(
            response,
            intl.formatMessage(messages.uploadFileFailed, {
              sourcePath: sourcePathForFile(file),
            }),
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
      toast.success(intl.formatMessage(messages.uploadSuccess, { count: files.length }));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.uploadFailed),
      );
    },
  });

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

  const resolvedFiles = useMemo(() => sortFilesByPath(loadedFiles), [loadedFiles]);
  const projectCapabilities = getProjectWorkspaceCapabilities({ projectId });
  const isProviderProject = projectCapabilities.isProviderProject;
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const projectTargetLocales = projectQuery.data?.targetLocales;
  const projectSourceLocale = projectQuery.data?.sourceLocale ?? "en";

  const openFileInCat = useCallback(
    (sourcePath: string) => {
      const file = resolvedFiles.find((entry) => entry.sourcePath === sourcePath);
      if (!file) {
        return;
      }

      const targetLocaleResolution = resolveProjectFileCatTargetLocaleResolution(
        file,
        highlightLocale,
        projectTargetLocales,
      );
      const targetLocale = targetLocaleResolution.targetLocale;
      if (!canOpenProjectFileCat(file) || !targetLocale) {
        toast.error(
          targetLocale
            ? intl.formatMessage(messages.cannotOpenCat)
            : intl.formatMessage(messages.noTargetLocale),
        );
        return;
      }

      if (
        targetLocaleResolution.status === "fallback" &&
        targetLocaleResolution.requestedLocale &&
        targetLocaleResolution.requestedLocale !== targetLocale
      ) {
        toast.warning(
          intl.formatMessage(messages.localeFallbackToast, {
            requestedLocale: targetLocaleResolution.requestedLocale,
            targetLocale,
          }),
        );
      }

      const href = buildProjectFileCatHref(
        organizationSlug,
        projectId,
        file,
        highlightLocale,
        selectedBranch,
        projectTargetLocales,
      );
      if (href) {
        router.push(href);
      }
    },
    [
      highlightLocale,
      intl,
      organizationSlug,
      projectId,
      projectTargetLocales,
      resolvedFiles,
      router,
      selectedBranch,
    ],
  );

  const selectedFileForTree = useMemo(
    () => resolvedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? null,
    [resolvedFiles, selectedSourcePath],
  );
  const nativeSourcePaths = useMemo(
    () => resolvedFiles.filter((entry) => !entry.provider).map((entry) => entry.sourcePath),
    [resolvedFiles],
  );
  const catOpenHint = selectedFileForTree
    ? (() => {
        const targetLocaleResolution = resolveProjectFileCatTargetLocaleResolution(
          selectedFileForTree,
          highlightLocale,
          projectTargetLocales,
        );
        const targetLocale = targetLocaleResolution.targetLocale;
        if (targetLocale) {
          if (
            targetLocaleResolution.status === "fallback" &&
            targetLocaleResolution.requestedLocale &&
            targetLocaleResolution.requestedLocale !== targetLocale
          ) {
            return intl.formatMessage(messages.localeFallbackHint, {
              requestedLocale: targetLocaleResolution.requestedLocale,
              targetLocale,
            });
          }

          return intl.formatMessage(messages.openCatHint, { targetLocale });
        }

        return intl.formatMessage(messages.noTargetLocale);
      })()
    : null;

  const [dialogRequest, setDialogRequest] = useState<{
    file: ProjectFileRecord;
    action: PendingFileDialogAction;
  } | null>(null);

  const closeFileDialog = useCallback(() => {
    setDialogRequest(null);
  }, []);

  const openFileDialog = useCallback((file: ProjectFileRecord, action: PendingFileDialogAction) => {
    setDialogRequest({ file, action });
  }, []);

  const treeFileActions = useMemo<ProjectFileTreeActionsConfig>(
    () => ({
      organizationSlug,
      projectId,
      highlightLocale,
      projectTargetLocales,
      sourceLocale: projectSourceLocale,
      nativeSourcePaths,
      branch: selectedBranch,
      onViewStrings: (file) => openFileInCat(file.sourcePath),
      onTranslateFile: (file) => openFileDialog(file, "translate"),
      onImportFile: (file) => openFileDialog(file, "import"),
      onDownloadFile: (file) => openFileDialog(file, "download"),
    }),
    [
      highlightLocale,
      nativeSourcePaths,
      openFileDialog,
      openFileInCat,
      organizationSlug,
      projectId,
      projectSourceLocale,
      projectTargetLocales,
      selectedBranch,
    ],
  );

  return (
    <>
      {dialogRequest ? (
        <ProjectFileDialogHost
          key={`${dialogRequest.file.sourcePath}:${dialogRequest.action}`}
          file={dialogRequest.file}
          initialAction={dialogRequest.action}
          organizationSlug={organizationSlug}
          projectId={projectId}
          highlightLocale={highlightLocale}
          projectTargetLocales={projectTargetLocales}
          sourceLocale={projectSourceLocale}
          nativeSourcePaths={nativeSourcePaths}
          branch={selectedBranch}
          onClose={closeFileDialog}
        />
      ) : null}
      <ProjectFilesPageContentView
        organizationSlug={organizationSlug}
        projectId={projectId}
        files={[]}
        resolvedFiles={resolvedFiles}
        isFilesLoading={false}
        isFilesFetching={false}
        selectedSourcePath={selectedSourcePath}
        highlightLocale={highlightLocale}
        selectedBranch={selectedBranch}
        projectTargetLocales={projectTargetLocales}
        projectSourceLocale={projectSourceLocale}
        isProviderProject={isProviderProject}
        selectedFiles={selectedFiles}
        isUploading={uploadFiles.isPending}
        onSelectSourcePath={setSelectedSourcePath}
        onSelectBranch={setSelectedBranch}
        onAddSelectedFiles={addSelectedFiles}
        onRemoveSelectedFile={removeSelectedFile}
        onUploadSelectedFiles={() => uploadFiles.mutate(selectedFiles)}
        filesTree={() => (
          <ProjectFilesTreePanel
            organizationSlug={organizationSlug}
            projectId={projectId}
            selectedSourcePath={selectedSourcePath}
            onSelectSourcePath={setSelectedSourcePath}
            onLoadedFilesChange={setLoadedFiles}
            onActivateFile={openFileInCat}
            catOpenHint={catOpenHint}
            fileActions={treeFileActions}
            branch={selectedBranch}
            headerActions={
              isProviderProject ? (
                <ProjectFilesBranchFilter
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  selectedBranch={selectedBranch}
                  onSelectedBranchChange={setSelectedBranch}
                />
              ) : null
            }
          />
        )}
      />
    </>
  );
}

export function ProjectFilesPageContentView({
  organizationSlug,
  projectId,
  files,
  resolvedFiles,
  isFilesLoading,
  isFilesFetching,
  filesError,
  selectedSourcePath,
  highlightLocale: _highlightLocale,
  selectedBranch: _selectedBranch = null,
  projectTargetLocales: _projectTargetLocales,
  projectSourceLocale: _projectSourceLocale = "en",
  isProviderProject: isProviderProjectProp,
  selectedFiles,
  isUploading,
  onSelectSourcePath,
  onSelectBranch: _onSelectBranch,
  onAddSelectedFiles,
  onRemoveSelectedFile,
  onUploadSelectedFiles,
  renderError = defaultRenderFilesError,
  renderFilesTree = defaultRenderFilesTree,
  filesTree,
}: {
  organizationSlug: string;
  projectId: string;
  files: ProjectFileRecord[];
  resolvedFiles?: ProjectFileRecord[];
  isFilesLoading: boolean;
  isFilesFetching: boolean;
  filesError?: unknown;
  selectedSourcePath: string | null;
  highlightLocale: string | null;
  selectedBranch?: string | null;
  projectTargetLocales?: readonly string[] | null;
  projectSourceLocale?: string;
  isProviderProject?: boolean;
  selectedFiles: File[];
  isUploading: boolean;
  onSelectSourcePath: (sourcePath: string | null) => void;
  onSelectBranch?: (branch: string | null) => void;
  onAddSelectedFiles: (files: File[]) => void;
  onRemoveSelectedFile: (file: File) => void;
  onUploadSelectedFiles: () => void;
  renderError?: ProjectFilesErrorRenderer;
  renderFilesTree?: ProjectFilesTreeRenderer;
  filesTree?: (selectedFile: ProjectFileRecord | null) => ReactNode;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const displayFiles = filesTree ? (resolvedFiles ?? files) : files;
  const selectedFile = useMemo(
    () => displayFiles.find((file) => file.sourcePath === selectedSourcePath) ?? null,
    [displayFiles, selectedSourcePath],
  );
  const projectCapabilities = getProjectWorkspaceCapabilities({ projectId });
  const isProviderProject = isProviderProjectProp ?? projectCapabilities.isProviderProject;
  const canUploadFiles = projectCapabilities.canUploadFiles;

  return (
    <ProjectPageShell className="gap-8">
      <ProjectSectionHeader
        icon={File01Icon}
        section={intl.formatMessage(messages.sectionTitle)}
        description={intl.formatMessage(
          isProviderProject ? messages.descriptionProvider : messages.descriptionNative,
        )}
        actions={
          canUploadFiles ? (
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-fit"
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.addFiles} />
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
        <section className="rounded-lg border border-border bg-muted p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <ProjectSectionTitle>
                <FormattedMessage {...messages.readyToUpload} />
              </ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                <FormattedMessage
                  {...messages.filesSelected}
                  values={{ count: selectedFiles.length, max: MAX_UPLOAD_FILES }}
                />
              </TypographyP>
            </div>
            <Button
              type="button"
              disabled={isUploading}
              onClick={onUploadSelectedFiles}
              className="w-full sm:w-fit"
            >
              {isUploading ? <Spinner /> : <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />}
              {isUploading ? (
                <FormattedMessage {...messages.uploading} />
              ) : (
                <FormattedMessage {...messages.upload} />
              )}
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-background">
            {selectedFiles.map((file) => (
              <li key={fileKey(file)} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <TypographyP className="truncate font-mono text-sm text-foreground">
                    {sourcePathForFile(file)}
                  </TypographyP>
                  <TypographyP className="text-xs text-muted-foreground">
                    {formatBytes(file.size, intl)}
                  </TypographyP>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => onRemoveSelectedFile(file)}
                >
                  <FormattedMessage {...messages.remove} />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex min-h-64 flex-col overflow-hidden rounded-lg border border-border bg-muted">
        {filesTree ? (
          <div className="flex min-h-0 flex-1 flex-col">{filesTree(selectedFile)}</div>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <ProjectSectionTitle>
                  <FormattedMessage {...messages.projectFilesTitle} />
                </ProjectSectionTitle>
                <TypographyP className="mt-0.5 text-sm text-muted-foreground">
                  {isFilesLoading ? (
                    <FormattedMessage {...messages.loading} />
                  ) : filesError ? (
                    <FormattedMessage {...messages.couldNotLoad} />
                  ) : (
                    <FormattedMessage {...messages.fileCount} values={{ count: files.length }} />
                  )}
                </TypographyP>
              </div>
              {isFilesFetching && !isFilesLoading ? <Spinner /> : null}
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
              {isFilesLoading ? (
                <TypographyP className="p-4 text-sm text-muted-foreground">
                  <FormattedMessage {...messages.loadingFiles} />
                </TypographyP>
              ) : filesError ? (
                <div className="p-4">{renderError({ organizationSlug, error: filesError })}</div>
              ) : files.length === 0 ? (
                <div className="flex flex-col gap-2 p-4">
                  <TypographyP className="text-sm font-medium text-foreground">
                    <FormattedMessage {...messages.noFilesYet} />
                  </TypographyP>
                  <TypographyP className="text-sm text-muted-foreground">
                    {isProviderProject ? (
                      <FormattedMessage {...messages.noProviderFiles} />
                    ) : (
                      <FormattedMessage {...messages.noNativeFiles} />
                    )}
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
            </div>
          </>
        )}
      </section>
    </ProjectPageShell>
  );
}
