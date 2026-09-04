"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { supportsProviderContentEditorFile } from "@/lib/providers/capabilities/provider-content-editor-capabilities";

import {
  ContentEditorFileTreePicker,
  ContentEditorLocaleSelect,
} from "../../../../_components/content-editor-header-pickers";
import { ProjectPageShell, useProjectPageQuery } from "../../../../_components/project-page-shell";
import {
  contentEditorFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "./job-content-editor-repository-preference";
import { selectJobContentEditorTargetLocale } from "./job-content-editor-target-locale";
import { resolveDefaultJobContentEditorFileReference } from "./job-content-editor-default-file";
import {
  loadJobContentEditorJobSourceFiles,
  loadJobContentEditorProviderJobFiles,
  loadJobContentEditorSelectableTargetLocales,
  loadJobContentEditorTargetFile,
} from "./load-job-content-editor-files";
import {
  canLookupFreshCatRepositoryContext,
  selectJobContentEditorRepository,
  sortJobContentEditorProviderFiles,
} from "./select-job-content-editor-repository";
import { jobCatPageContentMessages } from "./job-content-editor-page-content.messages";
import { ProjectFileContentEditorWorkspace } from "@/components/content-editor/project-file/project-file-content-editor-workspace";
import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import {
  isServerQueueFilter,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import {
  jobContentEditorQueueFilterParam,
  jobCatSearchParam,
} from "@/lib/projects/job-content-editor-routing";
import {
  buildCatNavigationSearchParams,
  contentEditorWorkspaceQueueSortParam,
} from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import {
  CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
  isContentEditorAllFilesSourcePath,
  serializeCatSourcePathsFilter,
} from "@/lib/projects/content-editor-all-files";

type JobContentEditorGithubRepository = {
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

function projectJobContentEditorTargetFileQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string | null,
  storedFileId: string | null,
) {
  return [
    "project-job-content-editor-target-file",
    organizationSlug,
    projectId,
    sourcePath,
    storedFileId,
  ] as const;
}

function projectJobContentEditorDefaultFileQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
  targetLocale: string | null,
) {
  return [
    "project-job-content-editor-default-file",
    organizationSlug,
    projectId,
    jobId,
    targetLocale,
  ] as const;
}

function projectJobContentEditorSelectableLocalesQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
) {
  return [
    "project-job-content-editor-selectable-locales",
    organizationSlug,
    projectId,
    jobId,
  ] as const;
}

function projectJobContentEditorProviderFilesQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
) {
  return ["project-job-content-editor-provider-files", organizationSlug, projectId, jobId] as const;
}

function githubInstallationRepositoriesQueryKey(organizationSlug: string) {
  return ["github-installation-repositories", organizationSlug] as const;
}

function stringsPageHref(input: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath?: string;
  storedFileId?: string;
  sourcePaths?: readonly string[];
  targetLocale: string;
  segment?: string | null;
  queueFilter?: ContentEditorQueueFilter;
  queueSort?: ContentEditorQueueSort;
  search?: string | null;
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

  if (input.sourcePaths && input.sourcePaths.length > 0) {
    params.set("sourcePaths", serializeCatSourcePathsFilter(input.sourcePaths));
  }

  if (input.segment) {
    params.set("segment", input.segment);
  }

  if (input.queueFilter && isServerQueueFilter(input.queueFilter) && input.queueFilter !== "all") {
    params.set(jobContentEditorQueueFilterParam, input.queueFilter);
  }

  if (input.queueSort && input.queueSort !== "file_order") {
    params.set(contentEditorWorkspaceQueueSortParam, input.queueSort);
  }

  if (input.search?.trim()) {
    params.set(jobCatSearchParam, input.search.trim());
  }

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}/strings?${params.toString()}`;
}

export function JobContentEditorPageContent({
  organizationSlug,
  projectId,
  jobId,
  sourcePath,
  storedFileId = null,
  sourcePaths = null,
  targetLocale,
  initialSegmentKey = null,
  initialQueueFilter = "untranslated",
  initialQueueSort = "file_order",
  initialSearch = "",
  contentEditorAllFilesEnabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath: string | null;
  storedFileId?: string | null;
  sourcePaths?: string | null;
  targetLocale: string | null;
  initialSegmentKey?: string | null;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  contentEditorAllFilesEnabled?: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const pageNavigationGuardRef = useRef<ContentEditorPageNavigationGuardRef["current"]>(null);
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  const canUseAllFiles = contentEditorAllFilesEnabled;
  const requestedAllFiles = isContentEditorAllFilesSourcePath(sourcePath) && Boolean(sourcePath);
  const allFiles = canUseAllFiles && requestedAllFiles;
  const hasFileReference = Boolean((sourcePath && !requestedAllFiles) || storedFileId) || allFiles;
  const isNativeJob = Boolean(storedFileId) && !allFiles;
  const didAutoSelectDefaultFileRef = useRef(false);
  const defaultFileQuery = useQuery({
    queryKey: projectJobContentEditorDefaultFileQueryKey(
      organizationSlug,
      projectId,
      jobId,
      targetLocale,
    ),
    enabled: !hasFileReference || allFiles,
    queryFn: async () => {
      const files = await loadJobContentEditorJobSourceFiles({
        organizationSlug,
        projectId,
        jobId,
        targetLocale,
      });

      return {
        files,
        reference: resolveDefaultJobContentEditorFileReference(files, targetLocale),
      };
    },
  });
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, {
    enabled: hasFileReference,
  });
  // allFiles uses projectQuery + job file lists
  useAppShellSidebar({ forceCollapsed: hasFileReference });
  const targetFileQuery = useQuery({
    queryKey: projectJobContentEditorTargetFileQueryKey(
      organizationSlug,
      projectId,
      sourcePath,
      storedFileId,
    ),
    enabled: hasFileReference && !allFiles,
    queryFn: () =>
      loadJobContentEditorTargetFile({
        organizationSlug,
        projectId,
        sourcePath,
        storedFileId,
      }),
  });

  const providerFilesQuery = useQuery({
    queryKey: projectJobContentEditorProviderFilesQueryKey(organizationSlug, projectId, jobId),
    enabled: (hasFileReference && !isNativeJob) || allFiles,
    queryFn: () =>
      loadJobContentEditorProviderJobFiles({ organizationSlug, projectId, jobId, targetLocale }),
  });

  const jobLocalesQuery = useQuery({
    queryKey: projectJobContentEditorSelectableLocalesQueryKey(organizationSlug, projectId, jobId),
    enabled: hasFileReference || allFiles,
    queryFn: () =>
      loadJobContentEditorSelectableTargetLocales({ organizationSlug, projectId, jobId }),
  });

  const repositoriesQuery = useQuery({
    queryKey: githubInstallationRepositoriesQueryKey(organizationSlug),
    enabled: hasFileReference,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });

      if (!response.ok) {
        throw new Error("Failed to load GitHub repositories");
      }

      const body = (await response.json()) as { repositories: JobContentEditorGithubRepository[] };
      return body.repositories;
    },
  });

  const providerFiles = useMemo(
    () =>
      sortJobContentEditorProviderFiles(providerFilesQuery.data ?? []).filter(
        (file) => file.provider && supportsProviderContentEditorFile(file),
      ),
    [providerFilesQuery.data],
  );

  const selectedFile = targetFileQuery.data?.status === "found" ? targetFileQuery.data.file : null;
  const isNativeFile = isNativeJob || Boolean(selectedFile && !selectedFile.provider);

  const enabledRepositoryFullNames = useMemo(
    () =>
      (repositoriesQuery.data ?? [])
        .filter((repository) => repository.enabled && !repository.archived)
        .map((repository) => repository.fullName),
    [repositoriesQuery.data],
  );

  const repositoryPreferencePath = allFiles
    ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH
    : selectedFile?.sourcePath;
  const repositoryPreferenceKey = repositoryPreferencePath
    ? contentEditorFileRepositoryPreferenceKey(
        organizationSlug,
        projectId,
        repositoryPreferencePath,
      )
    : null;

  const [repositoryOverride, setRepositoryOverride] = useState<string | null>(null);

  useEffect(() => {
    setRepositoryOverride(null);
  }, [repositoryPreferenceKey]);

  const autoSelectedRepositoryFullName = useMemo(() => {
    if (!repositoryPreferenceKey) {
      return null;
    }

    return selectJobContentEditorRepository({
      enabledRepositoryFullNames,
      savedRepositoryFullName: readCatFileRepositoryPreference(repositoryPreferenceKey),
    });
  }, [enabledRepositoryFullNames, repositoryPreferenceKey]);

  const selectedRepositoryFullName = repositoryOverride ?? autoSelectedRepositoryFullName;

  const handleRepositoryChange = (
    nextRepositoryFullName: string,
    destinationSourcePath?: string,
  ) => {
    const preferencePath =
      destinationSourcePath ?? (allFiles ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH : sourcePath);
    if (!preferencePath) {
      return;
    }

    writeCatFileRepositoryPreference(
      contentEditorFileRepositoryPreferenceKey(organizationSlug, projectId, preferencePath),
      nextRepositoryFullName,
    );
    setRepositoryOverride(nextRepositoryFullName);
  };

  const repositoryBanner =
    repositoriesQuery.isError ||
    (enabledRepositoryFullNames.length > 1 && !selectedRepositoryFullName) ? (
      <div className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4 lg:px-6">
        {repositoriesQuery.isError ? (
          <TypographyP size="xsmall" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.repositoriesLoadFailed} />
          </TypographyP>
        ) : (
          <TypographyP size="xsmall" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.selectRepositoryForContext} />
          </TypographyP>
        )}
      </div>
    ) : null;

  const jobTargetLocales = jobLocalesQuery.data ?? [];
  const activeTargetLocale = selectJobContentEditorTargetLocale({
    requestedTargetLocale: targetLocale,
    providerTargetLocales:
      jobTargetLocales.length > 0 ? jobTargetLocales : targetLocale ? [targetLocale] : [],
  });

  const handleLocaleChange = (nextLocale: string) => {
    if (!nextLocale || nextLocale === activeTargetLocale) {
      return;
    }

    const navigate = () => {
      const params = buildCatNavigationSearchParams(window.location.search, {
        targetLocale: nextLocale,
      });
      router.push(
        `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
      );
    };

    attemptCatPageNavigation(pageNavigationGuardRef, navigate);
  };

  useEffect(() => {
    if (
      hasFileReference ||
      didAutoSelectDefaultFileRef.current ||
      !defaultFileQuery.data?.reference
    ) {
      return;
    }

    didAutoSelectDefaultFileRef.current = true;
    const jobSourcePaths = defaultFileQuery.data.files
      .map((file) => file.sourcePath)
      .filter((path): path is string => Boolean(path?.trim()));
    const reference = defaultFileQuery.data.reference;

    if (canUseAllFiles) {
      router.replace(
        stringsPageHref({
          organizationSlug,
          projectId,
          jobId,
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
          sourcePaths: jobSourcePaths,
          targetLocale: reference.targetLocale,
          segment: initialSegmentKey,
          queueFilter: initialQueueFilter,
          queueSort: initialQueueSort,
        }),
      );
      return;
    }

    router.replace(
      stringsPageHref({
        organizationSlug,
        projectId,
        jobId,
        sourcePath: reference.sourcePath ?? undefined,
        storedFileId: reference.storedFileId ?? undefined,
        targetLocale: reference.targetLocale,
        segment: initialSegmentKey,
        queueFilter: initialQueueFilter,
        queueSort: initialQueueSort,
      }),
    );
  }, [
    canUseAllFiles,
    defaultFileQuery.data,
    hasFileReference,
    initialSegmentKey,
    initialQueueFilter,
    initialQueueSort,
    jobId,
    organizationSlug,
    projectId,
    router,
  ]);

  if (!hasFileReference) {
    if (defaultFileQuery.isLoading) {
      return (
        <ProjectPageShell>
          <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
            <Spinner />
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    if (defaultFileQuery.isError) {
      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP className="text-flame-100" size="small">
              {defaultFileQuery.error instanceof Error
                ? defaultFileQuery.error.message
                : intl.formatMessage(jobCatPageContentMessages.unableToLoadTaskFiles)}
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    if (!defaultFileQuery.data?.reference) {
      const hasSourceFiles = (defaultFileQuery.data?.files.length ?? 0) > 0;
      const emptyStateMessage =
        hasSourceFiles && !targetLocale
          ? intl.formatMessage(jobCatPageContentMessages.noTargetLocaleSpecified)
          : intl.formatMessage(jobCatPageContentMessages.noSourceFileLinked);

      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP size="small" tone="subtle">
              {emptyStateMessage}
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.openingWorkspace} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (allFiles) {
    const defaultJobFiles = defaultFileQuery.data?.files ?? [];
    const jobFiles =
      providerFiles.length > 0
        ? providerFiles
        : defaultJobFiles.filter((file) => Boolean(file.storedFileId || file.provider));
    const jobSourcePaths =
      sourcePaths
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ??
      jobFiles
        .map((file) => file.sourcePath)
        .filter((path): path is string => Boolean(path?.trim()));
    const selectedTargetLocale = activeTargetLocale ?? targetLocale;

    if (
      projectQuery.isLoading ||
      defaultFileQuery.isLoading ||
      (!isNativeJob && providerFilesQuery.isLoading && !providerFilesQuery.data) ||
      (!selectedTargetLocale && jobLocalesQuery.isLoading)
    ) {
      return (
        <ProjectPageShell>
          <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
            <Spinner />
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    const sourceLocale = projectQuery.data?.sourceLocale;
    if (projectQuery.isSuccess && !sourceLocale) {
      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP className="text-flame-100" size="small">
              <FormattedMessage {...jobCatPageContentMessages.projectMissingSourceLocale} />
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    if (!sourceLocale || !selectedTargetLocale) {
      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP size="small" tone="subtle">
              {!sourceLocale ? (
                <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
              ) : (
                <FormattedMessage {...jobCatPageContentMessages.noTargetLocaleForTask} />
              )}
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    const handleAllFilesLocaleChange = (nextLocale: string) => {
      if (!nextLocale || nextLocale === selectedTargetLocale) {
        return;
      }
      attemptCatPageNavigation(pageNavigationGuardRef, () => {
        const params = buildCatNavigationSearchParams(window.location.search, {
          targetLocale: nextLocale,
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
          sourcePaths: serializeCatSourcePathsFilter(jobSourcePaths),
          storedFileId: null,
        });
        router.push(
          `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
        );
      });
    };

    const handleJobFileChange = (nextSourcePath: string | null) => {
      if (!nextSourcePath) {
        return;
      }
      const params = buildCatNavigationSearchParams(window.location.search, {
        sourcePath: nextSourcePath,
        targetLocale: selectedTargetLocale,
        storedFileId: null,
        sourcePaths: null,
        segment: null,
      });
      router.push(
        `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
      );
    };

    const handleJobSelectAllFiles = () => {
      const params = buildCatNavigationSearchParams(window.location.search, {
        sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
        sourcePaths: serializeCatSourcePathsFilter(jobSourcePaths),
        targetLocale: selectedTargetLocale,
        storedFileId: null,
        segment: null,
      });
      router.push(
        `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
      );
    };

    return (
      <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8 shrink-0"
              render={<Link href={taskHref} />}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>

            <ContentEditorFileTreePicker
              files={jobFiles}
              selectedSourcePath=""
              onSelectFile={handleJobFileChange}
              allFilesSelected
              onSelectAllFiles={canUseAllFiles ? handleJobSelectAllFiles : undefined}
              repositoryFullNames={enabledRepositoryFullNames}
              selectedRepositoryFullName={selectedRepositoryFullName}
              onRepositoryChange={handleRepositoryChange}
            />

            {jobTargetLocales.length > 0 ? (
              <ContentEditorLocaleSelect
                targetLocales={jobTargetLocales}
                selectedTargetLocale={selectedTargetLocale}
                onTargetLocaleChange={handleAllFilesLocaleChange}
              />
            ) : null}
          </div>

          <ContentEditorQueueToolbarHost />
        </div>

        {repositoryBanner}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
          <ProjectFileContentEditorWorkspace
            key={`${CONTENT_EDITOR_ALL_FILES_SOURCE_PATH}:${selectedTargetLocale}`}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourceLocale={sourceLocale}
            sourcePath={CONTENT_EDITOR_ALL_FILES_SOURCE_PATH}
            targetLocale={selectedTargetLocale}
            highlightLocale={selectedTargetLocale}
            repositoryFullName={selectedRepositoryFullName}
            canLookupFreshContext={canLookupFreshCatRepositoryContext(
              enabledRepositoryFullNames,
              selectedRepositoryFullName,
            )}
            initialSegmentKey={initialSegmentKey}
            initialQueueFilter={initialQueueFilter}
            initialQueueSort={initialQueueSort}
            initialSearch={initialSearch}
            sourcePathsFilter={serializeCatSourcePathsFilter(jobSourcePaths)}
            layout="fullscreen"
            className="min-h-0 flex-1"
            pageNavigationGuardRef={pageNavigationGuardRef}
          />
        </div>
      </main>
    );
  }

  if (targetFileQuery.isLoading || projectQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (targetFileQuery.isError || projectQuery.isError) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-flame-100" size="small">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : targetFileQuery.error instanceof Error
                ? targetFileQuery.error.message
                : intl.formatMessage(jobCatPageContentMessages.unableToLoadTaskFiles)}
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (targetFileQuery.data?.status === "list_truncated") {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="font-mono" size="small" tone="content">
            {targetFileQuery.data.reference}
          </TypographyP>
          <TypographyP className="mt-2" size="small" tone="subtle">
            <FormattedMessage
              {...jobCatPageContentMessages.listTruncated}
              values={{ fetchedCount: targetFileQuery.data.fetchedCount }}
            />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (!selectedFile) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="font-mono" size="small" tone="content">
            {sourcePath ?? storedFileId}
          </TypographyP>
          <TypographyP className="mt-2" size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.sourceFileNoLongerLinked} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const sourceLocale = projectQuery.data?.sourceLocale;
  if (projectQuery.isSuccess && !sourceLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-flame-100" size="small">
            <FormattedMessage {...jobCatPageContentMessages.projectMissingSourceLocale} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (!sourceLocale) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (repositoriesQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (isNativeFile) {
    if (!activeTargetLocale) {
      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...jobCatPageContentMessages.noTargetLocaleForTaskFile} />
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    return (
      <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8 shrink-0"
              render={<Link href={taskHref} />}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>

            <ContentEditorFileTreePicker
              files={[selectedFile]}
              selectedSourcePath={selectedFile.sourcePath}
              onSelectFile={() => undefined}
              repositoryFullNames={enabledRepositoryFullNames}
              selectedRepositoryFullName={selectedRepositoryFullName}
              onRepositoryChange={handleRepositoryChange}
            />

            {jobTargetLocales.length > 0 ? (
              <ContentEditorLocaleSelect
                targetLocales={jobTargetLocales}
                selectedTargetLocale={activeTargetLocale}
                onTargetLocaleChange={handleLocaleChange}
              />
            ) : null}
          </div>

          <ContentEditorQueueToolbarHost />
        </div>

        {repositoryBanner}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
          <ProjectFileContentEditorWorkspace
            key={`${selectedFile.sourcePath}:${activeTargetLocale}`}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourceLocale={sourceLocale}
            sourcePath={selectedFile.sourcePath}
            targetLocale={activeTargetLocale}
            highlightLocale={activeTargetLocale}
            repositoryFullName={selectedRepositoryFullName}
            canLookupFreshContext={canLookupFreshCatRepositoryContext(
              enabledRepositoryFullNames,
              selectedRepositoryFullName,
            )}
            initialSegmentKey={initialSegmentKey}
            initialQueueFilter={initialQueueFilter}
            initialQueueSort={initialQueueSort}
            initialSearch={initialSearch}
            layout="fullscreen"
            className="min-h-0 flex-1"
            pageNavigationGuardRef={pageNavigationGuardRef}
          />
        </div>
      </main>
    );
  }

  if (!supportsProviderContentEditorFile(selectedFile) || !selectedFile.provider) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.stringEditingUnsupported} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const selectedTargetLocale = activeTargetLocale;

  if (!selectedTargetLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.noTargetLocaleForProviderFile} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const handleFileChange = (nextSourcePath: string | null) => {
    if (!nextSourcePath) {
      return;
    }

    const nextFile = providerFiles.find((file) => file.sourcePath === nextSourcePath);
    if (!nextFile?.provider) {
      return;
    }

    const nextTargetLocale = selectJobContentEditorTargetLocale({
      requestedTargetLocale: targetLocale,
      providerTargetLocales:
        jobTargetLocales.length > 0 ? jobTargetLocales : targetLocale ? [targetLocale] : [],
    });

    if (!nextTargetLocale) {
      return;
    }

    const params = buildCatNavigationSearchParams(window.location.search, {
      sourcePath: nextSourcePath,
      targetLocale: nextTargetLocale,
      storedFileId: null,
      sourcePaths: null,
      segment: null,
    });
    router.push(
      `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
    );
  };

  return (
    <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            render={<Link href={taskHref} />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>

          <ContentEditorFileTreePicker
            files={providerFiles}
            selectedSourcePath={selectedFile.sourcePath}
            onSelectFile={handleFileChange}
            allFilesSelected={false}
            onSelectAllFiles={
              canUseAllFiles
                ? () => {
                    const params = buildCatNavigationSearchParams(window.location.search, {
                      sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
                      sourcePaths: serializeCatSourcePathsFilter(
                        providerFiles.map((file) => file.sourcePath),
                      ),
                      targetLocale: selectedTargetLocale,
                      storedFileId: null,
                      segment: null,
                    });
                    router.push(
                      `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/strings?${params.toString()}`,
                    );
                  }
                : undefined
            }
            repositoryFullNames={enabledRepositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />

          {jobTargetLocales.length > 0 ? (
            <ContentEditorLocaleSelect
              targetLocales={jobTargetLocales}
              selectedTargetLocale={selectedTargetLocale}
              onTargetLocaleChange={handleLocaleChange}
            />
          ) : null}
        </div>

        <ContentEditorQueueToolbarHost />
      </div>

      {repositoryBanner}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
        <ProjectFileContentEditorWorkspace
          key={`${selectedFile.sourcePath}:${selectedTargetLocale}`}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          sourcePath={selectedFile.sourcePath}
          externalResourceId={selectedFile.provider.externalResourceId}
          resourceType={selectedFile.provider.resourceType}
          targetLocale={selectedTargetLocale}
          repositoryFullName={selectedRepositoryFullName}
          canLookupFreshContext={canLookupFreshCatRepositoryContext(
            enabledRepositoryFullNames,
            selectedRepositoryFullName,
          )}
          initialSegmentKey={initialSegmentKey}
          initialQueueFilter={initialQueueFilter}
          initialQueueSort={initialQueueSort}
          initialSearch={initialSearch}
          layout="fullscreen"
          className="min-h-0 flex-1"
          pageNavigationGuardRef={pageNavigationGuardRef}
        />
      </div>
    </main>
  );
}
