"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { supportsProviderCatFile } from "@/lib/providers/capabilities/provider-cat-capabilities";

import {
  CatFileTreePicker,
  CatLocaleSelect,
  CatRepositorySelect,
} from "../../../../_components/cat-header-pickers";
import { ProjectPageShell, useProjectPageQuery } from "../../../../_components/project-page-shell";
import {
  catFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "./job-cat-repository-preference";
import { selectJobCatTargetLocale } from "./job-cat-target-locale";
import { resolveDefaultJobCatFileReference } from "./job-cat-default-file";
import {
  loadJobCatJobSourceFiles,
  loadJobCatProviderJobFiles,
  loadJobCatSelectableTargetLocales,
  loadJobCatTargetFile,
} from "./load-job-cat-files";
import {
  canLookupFreshCatRepositoryContext,
  selectJobCatRepository,
  sortJobCatProviderFiles,
} from "./select-job-cat-repository";
import { jobCatPageContentMessages } from "./job-cat-page-content.messages";
import { ProjectFileCatWorkspace } from "@/components/cat/project-file/project-file-cat-workspace";
import {
  attemptCatPageNavigation,
  type CatPageNavigationGuardRef,
} from "@/components/cat/workspace/cat-page-navigation-guard";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import { jobCatQueueFilterParam } from "@/lib/projects/job-cat-routing";
import {
  CAT_ALL_FILES_SOURCE_PATH,
  isCatAllFilesSourcePath,
  serializeCatSourcePathsFilter,
} from "@/lib/projects/cat-all-files";

type JobCatGithubRepository = {
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

function projectJobCatTargetFileQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string | null,
  storedFileId: string | null,
) {
  return [
    "project-job-cat-target-file",
    organizationSlug,
    projectId,
    sourcePath,
    storedFileId,
  ] as const;
}

function projectJobCatDefaultFileQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
  targetLocale: string | null,
) {
  return [
    "project-job-cat-default-file",
    organizationSlug,
    projectId,
    jobId,
    targetLocale,
  ] as const;
}

function projectJobCatSelectableLocalesQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
) {
  return ["project-job-cat-selectable-locales", organizationSlug, projectId, jobId] as const;
}

function projectJobCatProviderFilesQueryKey(
  organizationSlug: string,
  projectId: string,
  jobId: string,
) {
  return ["project-job-cat-provider-files", organizationSlug, projectId, jobId] as const;
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
  queueFilter?: CatQueueFilter;
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

  if (input.queueFilter && input.queueFilter !== "all") {
    params.set(jobCatQueueFilterParam, input.queueFilter);
  }

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}/strings?${params.toString()}`;
}

export function JobCatPageContent({
  organizationSlug,
  projectId,
  jobId,
  sourcePath,
  storedFileId = null,
  sourcePaths = null,
  targetLocale,
  initialSegmentKey = null,
  initialQueueFilter = "untranslated",
  catAllFilesEnabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath: string | null;
  storedFileId?: string | null;
  sourcePaths?: string | null;
  targetLocale: string | null;
  initialSegmentKey?: string | null;
  initialQueueFilter?: CatQueueFilter;
  catAllFilesEnabled?: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const pageNavigationGuardRef = useRef<CatPageNavigationGuardRef["current"]>(null);
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  const canUseAllFiles = catAllFilesEnabled;
  const requestedAllFiles = isCatAllFilesSourcePath(sourcePath) && Boolean(sourcePath);
  const allFiles = canUseAllFiles && requestedAllFiles;
  const hasFileReference = Boolean((sourcePath && !requestedAllFiles) || storedFileId) || allFiles;
  const isNativeJob = Boolean(storedFileId) && !allFiles;
  const didAutoSelectDefaultFileRef = useRef(false);
  const defaultFileQuery = useQuery({
    queryKey: projectJobCatDefaultFileQueryKey(organizationSlug, projectId, jobId, targetLocale),
    enabled: !hasFileReference || allFiles,
    queryFn: async () => {
      const files = await loadJobCatJobSourceFiles({
        organizationSlug,
        projectId,
        jobId,
        targetLocale,
      });

      return {
        files,
        reference: resolveDefaultJobCatFileReference(files, targetLocale),
      };
    },
  });
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, {
    enabled: hasFileReference,
  });
  // allFiles uses projectQuery + job file lists
  useAppShellSidebar({ forceCollapsed: hasFileReference });
  const targetFileQuery = useQuery({
    queryKey: projectJobCatTargetFileQueryKey(
      organizationSlug,
      projectId,
      sourcePath,
      storedFileId,
    ),
    enabled: hasFileReference && !allFiles,
    queryFn: () =>
      loadJobCatTargetFile({
        organizationSlug,
        projectId,
        sourcePath,
        storedFileId,
      }),
  });

  const providerFilesQuery = useQuery({
    queryKey: projectJobCatProviderFilesQueryKey(organizationSlug, projectId, jobId),
    enabled: (hasFileReference && !isNativeJob) || allFiles,
    queryFn: () => loadJobCatProviderJobFiles({ organizationSlug, projectId, jobId, targetLocale }),
  });

  const jobLocalesQuery = useQuery({
    queryKey: projectJobCatSelectableLocalesQueryKey(organizationSlug, projectId, jobId),
    enabled: hasFileReference || allFiles,
    queryFn: () => loadJobCatSelectableTargetLocales({ organizationSlug, projectId, jobId }),
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

      const body = (await response.json()) as { repositories: JobCatGithubRepository[] };
      return body.repositories;
    },
  });

  const providerFiles = useMemo(
    () =>
      sortJobCatProviderFiles(providerFilesQuery.data ?? []).filter(
        (file) => file.provider && supportsProviderCatFile(file),
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

  const repositoryPreferencePath = allFiles ? CAT_ALL_FILES_SOURCE_PATH : selectedFile?.sourcePath;
  const repositoryPreferenceKey = repositoryPreferencePath
    ? catFileRepositoryPreferenceKey(organizationSlug, projectId, repositoryPreferencePath)
    : null;

  const [repositoryOverride, setRepositoryOverride] = useState<string | null>(null);

  useEffect(() => {
    setRepositoryOverride(null);
  }, [repositoryPreferenceKey]);

  const autoSelectedRepositoryFullName = useMemo(() => {
    if (!repositoryPreferenceKey) {
      return null;
    }

    return selectJobCatRepository({
      enabledRepositoryFullNames,
      savedRepositoryFullName: readCatFileRepositoryPreference(repositoryPreferenceKey),
    });
  }, [enabledRepositoryFullNames, repositoryPreferenceKey]);

  const selectedRepositoryFullName = repositoryOverride ?? autoSelectedRepositoryFullName;

  const handleRepositoryChange = (nextRepositoryFullName: string) => {
    if (!repositoryPreferenceKey) {
      return;
    }

    writeCatFileRepositoryPreference(repositoryPreferenceKey, nextRepositoryFullName);
    setRepositoryOverride(nextRepositoryFullName);
  };

  const repositoryBanner =
    repositoriesQuery.isError ||
    (enabledRepositoryFullNames.length > 1 && !selectedRepositoryFullName) ? (
      <div className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4 lg:px-6">
        {repositoriesQuery.isError ? (
          <TypographyP className="text-xs text-muted-foreground">
            <FormattedMessage {...jobCatPageContentMessages.repositoriesLoadFailed} />
          </TypographyP>
        ) : (
          <TypographyP className="text-xs text-muted-foreground">
            <FormattedMessage {...jobCatPageContentMessages.selectRepositoryForContext} />
          </TypographyP>
        )}
      </div>
    ) : null;

  const jobTargetLocales = jobLocalesQuery.data ?? [];
  const activeTargetLocale = selectJobCatTargetLocale({
    requestedTargetLocale: targetLocale,
    providerTargetLocales:
      jobTargetLocales.length > 0 ? jobTargetLocales : targetLocale ? [targetLocale] : [],
  });

  const handleLocaleChange = (nextLocale: string) => {
    if (!nextLocale || nextLocale === activeTargetLocale) {
      return;
    }

    const navigate = () => {
      router.push(
        stringsPageHref({
          organizationSlug,
          projectId,
          jobId,
          sourcePath: sourcePath ?? undefined,
          storedFileId: storedFileId ?? undefined,
          targetLocale: nextLocale,
          segment: initialSegmentKey,
          queueFilter: initialQueueFilter,
        }),
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
          sourcePath: CAT_ALL_FILES_SOURCE_PATH,
          sourcePaths: jobSourcePaths,
          targetLocale: reference.targetLocale,
          segment: initialSegmentKey,
          queueFilter: initialQueueFilter,
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
      }),
    );
  }, [
    canUseAllFiles,
    defaultFileQuery.data,
    hasFileReference,
    initialSegmentKey,
    initialQueueFilter,
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
            <TypographyP className="text-sm text-muted-foreground">
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
            <TypographyP className="text-sm text-flame-100">
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
            <TypographyP className="text-sm text-muted-foreground">{emptyStateMessage}</TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">
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
            <TypographyP className="text-sm text-muted-foreground">
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
            <TypographyP className="text-sm text-flame-100">
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
            <TypographyP className="text-sm text-muted-foreground">
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
        router.push(
          stringsPageHref({
            organizationSlug,
            projectId,
            jobId,
            sourcePath: CAT_ALL_FILES_SOURCE_PATH,
            sourcePaths: jobSourcePaths,
            targetLocale: nextLocale,
            segment: initialSegmentKey,
            queueFilter: initialQueueFilter,
          }),
        );
      });
    };

    const handleJobFileChange = (nextSourcePath: string | null) => {
      if (!nextSourcePath) {
        return;
      }
      router.push(
        stringsPageHref({
          organizationSlug,
          projectId,
          jobId,
          sourcePath: nextSourcePath,
          targetLocale: selectedTargetLocale,
          queueFilter: initialQueueFilter,
        }),
      );
    };

    const handleJobSelectAllFiles = () => {
      router.push(
        stringsPageHref({
          organizationSlug,
          projectId,
          jobId,
          sourcePath: CAT_ALL_FILES_SOURCE_PATH,
          sourcePaths: jobSourcePaths,
          targetLocale: selectedTargetLocale,
          queueFilter: initialQueueFilter,
        }),
      );
    };

    return (
      <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            render={<Link href={taskHref} />}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>

          <CatFileTreePicker
            files={jobFiles}
            selectedSourcePath=""
            onSelectFile={handleJobFileChange}
            allFilesSelected
            onSelectAllFiles={canUseAllFiles ? handleJobSelectAllFiles : undefined}
          />

          {enabledRepositoryFullNames.length > 0 ? (
            <CatRepositorySelect
              repositoryFullNames={enabledRepositoryFullNames}
              selectedRepositoryFullName={selectedRepositoryFullName}
              onRepositoryChange={handleRepositoryChange}
            />
          ) : null}

          {jobTargetLocales.length > 0 ? (
            <CatLocaleSelect
              targetLocales={jobTargetLocales}
              selectedTargetLocale={selectedTargetLocale}
              onTargetLocaleChange={handleAllFilesLocaleChange}
            />
          ) : null}
        </div>

        {repositoryBanner}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
          <ProjectFileCatWorkspace
            key={`${CAT_ALL_FILES_SOURCE_PATH}:${selectedTargetLocale}`}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourceLocale={sourceLocale}
            sourcePath={CAT_ALL_FILES_SOURCE_PATH}
            targetLocale={selectedTargetLocale}
            highlightLocale={selectedTargetLocale}
            repositoryFullName={selectedRepositoryFullName}
            canLookupFreshContext={canLookupFreshCatRepositoryContext(
              enabledRepositoryFullNames,
              selectedRepositoryFullName,
            )}
            initialSegmentKey={initialSegmentKey}
            initialQueueFilter={initialQueueFilter}
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
          <TypographyP className="text-sm text-muted-foreground">
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
          <TypographyP className="text-sm text-flame-100">
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
          <TypographyP className="font-mono text-sm text-foreground">
            {targetFileQuery.data.reference}
          </TypographyP>
          <TypographyP className="mt-2 text-sm text-muted-foreground">
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
          <TypographyP className="font-mono text-sm text-foreground">
            {sourcePath ?? storedFileId}
          </TypographyP>
          <TypographyP className="mt-2 text-sm text-muted-foreground">
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
          <TypographyP className="text-sm text-flame-100">
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
          <TypographyP className="text-sm text-muted-foreground">
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
          <TypographyP className="text-sm text-muted-foreground">
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
            <TypographyP className="text-sm text-muted-foreground">
              <FormattedMessage {...jobCatPageContentMessages.noTargetLocaleForTaskFile} />
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    return (
      <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            render={<Link href={taskHref} />}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>

          <TypographyP className="min-w-0 truncate font-mono text-xs text-muted-foreground sm:max-w-xs">
            {selectedFile.sourcePath}
          </TypographyP>

          {jobTargetLocales.length > 0 ? (
            <CatLocaleSelect
              targetLocales={jobTargetLocales}
              selectedTargetLocale={activeTargetLocale}
              onTargetLocaleChange={handleLocaleChange}
            />
          ) : null}

          {enabledRepositoryFullNames.length > 0 ? (
            <CatRepositorySelect
              repositoryFullNames={enabledRepositoryFullNames}
              selectedRepositoryFullName={selectedRepositoryFullName}
              onRepositoryChange={handleRepositoryChange}
            />
          ) : null}
        </div>

        {repositoryBanner}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
          <ProjectFileCatWorkspace
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
            layout="fullscreen"
            className="min-h-0 flex-1"
            pageNavigationGuardRef={pageNavigationGuardRef}
          />
        </div>
      </main>
    );
  }

  if (!supportsProviderCatFile(selectedFile) || !selectedFile.provider) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
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
          <TypographyP className="text-sm text-muted-foreground">
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

    const nextTargetLocale = selectJobCatTargetLocale({
      requestedTargetLocale: targetLocale,
      providerTargetLocales:
        jobTargetLocales.length > 0 ? jobTargetLocales : targetLocale ? [targetLocale] : [],
    });

    if (!nextTargetLocale) {
      return;
    }

    router.push(
      stringsPageHref({
        organizationSlug,
        projectId,
        jobId,
        sourcePath: nextSourcePath,
        targetLocale: nextTargetLocale,
        queueFilter: initialQueueFilter,
      }),
    );
  };

  return (
    <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-8 shrink-0"
          render={<Link href={taskHref} />}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>

        <CatFileTreePicker
          files={providerFiles}
          selectedSourcePath={selectedFile.sourcePath}
          onSelectFile={handleFileChange}
          allFilesSelected={false}
          onSelectAllFiles={
            canUseAllFiles
              ? () => {
                  router.push(
                    stringsPageHref({
                      organizationSlug,
                      projectId,
                      jobId,
                      sourcePath: CAT_ALL_FILES_SOURCE_PATH,
                      sourcePaths: providerFiles.map((file) => file.sourcePath),
                      targetLocale: selectedTargetLocale,
                      queueFilter: initialQueueFilter,
                    }),
                  );
                }
              : undefined
          }
        />

        {jobTargetLocales.length > 0 ? (
          <CatLocaleSelect
            targetLocales={jobTargetLocales}
            selectedTargetLocale={selectedTargetLocale}
            onTargetLocaleChange={handleLocaleChange}
          />
        ) : null}

        {enabledRepositoryFullNames.length > 0 ? (
          <CatRepositorySelect
            repositoryFullNames={enabledRepositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}

        <TypographyP className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block lg:max-w-48">
          {intl.formatMessage(jobCatPageContentMessages.providerKindAndFormat, {
            kind: selectedFile.provider.kind,
            format:
              selectedFile.provider.format ??
              intl.formatMessage(jobCatPageContentMessages.fileFormatFallback),
          })}
        </TypographyP>
      </div>

      {repositoryBanner}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
        <ProjectFileCatWorkspace
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
          layout="fullscreen"
          className="min-h-0 flex-1"
          pageNavigationGuardRef={pageNavigationGuardRef}
        />
      </div>
    </main>
  );
}
