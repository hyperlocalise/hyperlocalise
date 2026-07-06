"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";

import { CatFileTreePicker, CatRepositorySelect } from "../../../../_components/cat-header-pickers";
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
  loadJobCatTargetFile,
} from "./load-job-cat-files";
import {
  canLookupFreshCatRepositoryContext,
  selectJobCatRepository,
  sortJobCatProviderFiles,
} from "./select-job-cat-repository";
import { ProjectFileCatWorkspace } from "@/components/cat/project-file/project-file-cat-workspace";

const JOB_CAT_DEFAULT_QUEUE_FILTER = "untranslated" as const;

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
  targetLocale: string;
  segment?: string | null;
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

  if (input.segment) {
    params.set("segment", input.segment);
  }

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}/strings?${params.toString()}`;
}

export function JobCatPageContent({
  organizationSlug,
  projectId,
  jobId,
  sourcePath,
  storedFileId = null,
  targetLocale,
  initialSegmentKey = null,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath: string | null;
  storedFileId?: string | null;
  targetLocale: string | null;
  initialSegmentKey?: string | null;
}) {
  const router = useRouter();
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  const hasFileReference = Boolean(sourcePath || storedFileId);
  const isNativeJob = Boolean(storedFileId);
  const didAutoSelectDefaultFileRef = useRef(false);
  const defaultFileQuery = useQuery({
    queryKey: projectJobCatDefaultFileQueryKey(organizationSlug, projectId, jobId, targetLocale),
    enabled: !hasFileReference,
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
  useAppShellSidebar({ forceCollapsed: hasFileReference });
  const targetFileQuery = useQuery({
    queryKey: projectJobCatTargetFileQueryKey(
      organizationSlug,
      projectId,
      sourcePath,
      storedFileId,
    ),
    enabled: hasFileReference,
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
    enabled: hasFileReference && !isNativeJob,
    queryFn: () => loadJobCatProviderJobFiles({ organizationSlug, projectId, jobId, targetLocale }),
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

  const repositoryPreferenceKey = selectedFile
    ? catFileRepositoryPreferenceKey(organizationSlug, projectId, selectedFile.sourcePath)
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

  useEffect(() => {
    if (
      hasFileReference ||
      didAutoSelectDefaultFileRef.current ||
      !defaultFileQuery.data?.reference
    ) {
      return;
    }

    didAutoSelectDefaultFileRef.current = true;
    router.replace(
      stringsPageHref({
        organizationSlug,
        projectId,
        jobId,
        sourcePath: defaultFileQuery.data.reference.sourcePath ?? undefined,
        storedFileId: defaultFileQuery.data.reference.storedFileId ?? undefined,
        targetLocale: defaultFileQuery.data.reference.targetLocale,
        segment: initialSegmentKey,
      }),
    );
  }, [
    defaultFileQuery.data,
    hasFileReference,
    initialSegmentKey,
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
            <TypographyP className="text-sm text-muted-foreground">Loading workspace…</TypographyP>
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
                : "Unable to load task files."}
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    if (!defaultFileQuery.data?.reference) {
      const hasSourceFiles = (defaultFileQuery.data?.files.length ?? 0) > 0;
      const emptyStateMessage =
        hasSourceFiles && !targetLocale
          ? "No target locale is specified for this task."
          : "No source file is linked to this task.";

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
          <TypographyP className="text-sm text-muted-foreground">Opening workspace…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (targetFileQuery.isLoading || projectQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">Loading workspace…</TypographyP>
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
                : "Unable to load task files."}
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
            This project has more than {targetFileQuery.data.fetchedCount.toLocaleString()} files,
            so the source file could not be resolved from the loaded file list. Open CAT from the
            project Files page instead, or ask support to narrow the project file list.
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
            This source file is not linked to the task anymore.
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
            This project does not have a source locale.
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
          <TypographyP className="text-sm text-muted-foreground">Loading workspace…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (repositoriesQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">Loading workspace…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

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
            GitHub repositories could not be loaded. Repository context lookup is unavailable.
          </TypographyP>
        ) : (
          <TypographyP className="text-xs text-muted-foreground">
            Select a GitHub repository to look up string context.
          </TypographyP>
        )}
      </div>
    ) : null;

  if (isNativeFile) {
    if (!targetLocale) {
      return (
        <ProjectPageShell>
          <div className="rounded-lg border border-border bg-card p-5">
            <TypographyP className="text-sm text-muted-foreground">
              No target locale is available for this task file.
            </TypographyP>
          </div>
        </ProjectPageShell>
      );
    }

    return (
      <main className="-mx-4 -my-5 flex min-h-[calc(100svh-var(--app-shell-header-height))] flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
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
            key={selectedFile.sourcePath}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourceLocale={sourceLocale}
            sourcePath={selectedFile.sourcePath}
            targetLocale={targetLocale}
            highlightLocale={targetLocale}
            repositoryFullName={selectedRepositoryFullName}
            canLookupFreshContext={canLookupFreshCatRepositoryContext(
              enabledRepositoryFullNames,
              selectedRepositoryFullName,
            )}
            initialSegmentKey={initialSegmentKey}
            initialQueueFilter={JOB_CAT_DEFAULT_QUEUE_FILTER}
            layout="fullscreen"
            className="min-h-0 flex-1"
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
            String editing is only available for supported provider task files.
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const selectedTargetLocale = selectJobCatTargetLocale({
    requestedTargetLocale: targetLocale,
    providerTargetLocales: selectedFile.provider.targetLocales,
  });

  if (!selectedTargetLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            No target locale is available for this provider task file.
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
      providerTargetLocales: nextFile.provider.targetLocales,
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
      }),
    );
  };

  return (
    <main className="-mx-4 -my-5 flex h-[calc(100svh-var(--app-shell-header-height))] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
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
        />

        {enabledRepositoryFullNames.length > 0 ? (
          <CatRepositorySelect
            repositoryFullNames={enabledRepositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}

        <TypographyP className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block lg:max-w-48">
          {selectedFile.provider.kind} · {selectedFile.provider.format ?? "file"}
        </TypographyP>
      </div>

      {repositoryBanner}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
        <ProjectFileCatWorkspace
          key={selectedFile.sourcePath}
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
          initialQueueFilter={JOB_CAT_DEFAULT_QUEUE_FILTER}
          layout="fullscreen"
          className="min-h-0 flex-1"
        />
      </div>
    </main>
  );
}
