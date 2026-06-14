"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import { ProjectPageShell } from "../../../../_components/project-page-shell";
import { tmsLiveFileToProjectFileRecord } from "../../_components/tms/job-source-file-mappers";
import {
  catFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "./job-cat-repository-preference";
import { selectJobCatTargetLocale } from "./job-cat-target-locale";
import { selectJobCatRepository, sortJobCatProviderFiles } from "./select-job-cat-repository";
import { TmsJobCatWorkspace } from "./tms-job-cat-workspace";

type JobCatGithubRepository = {
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

function tmsLiveJobFilesQueryKey(organizationSlug: string, encodedJobId: string) {
  return ["tms-provider-job-files", organizationSlug, encodedJobId] as const;
}

function githubInstallationRepositoriesQueryKey(organizationSlug: string) {
  return ["github-installation-repositories", organizationSlug] as const;
}

function stringsPageHref(input: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  const params = new URLSearchParams({
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}/strings?${params.toString()}`;
}

export function JobCatPageContent({
  organizationSlug,
  projectId,
  jobId,
  sourcePath,
  targetLocale,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  sourcePath: string | null;
  targetLocale: string | null;
}) {
  const router = useRouter();
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  const filesQuery = useQuery({
    queryKey: tmsLiveJobFilesQueryKey(organizationSlug, jobId),
    enabled: Boolean(sourcePath),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].files.$get({
        param: { organizationSlug, encodedJobId: jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load task files (${response.status})`);
      }

      const body = (await response.json()) as { files: TmsProviderLiveFile[] };
      return body.files.map(tmsLiveFileToProjectFileRecord);
    },
  });

  const repositoriesQuery = useQuery({
    queryKey: githubInstallationRepositoriesQueryKey(organizationSlug),
    enabled: Boolean(sourcePath),
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

  const taskFiles = useMemo(
    () => sortJobCatProviderFiles(filesQuery.data ?? []),
    [filesQuery.data],
  );

  const providerFiles = useMemo(() => taskFiles.filter((file) => file.provider), [taskFiles]);

  const selectedFile = sourcePath ? taskFiles.find((file) => file.sourcePath === sourcePath) : null;

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

  if (!sourcePath) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            Choose a source file from the task, then open View strings.
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (filesQuery.isLoading || repositoriesQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">Loading workspace…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (filesQuery.isError) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-flame-100">
            {filesQuery.error instanceof Error
              ? filesQuery.error.message
              : "Unable to load task files."}
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (!selectedFile) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="font-mono text-sm text-foreground">{sourcePath}</TypographyP>
          <TypographyP className="mt-2 text-sm text-muted-foreground">
            This source file is not linked to the task anymore.
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (!selectedFile.provider) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            String editing is only available for provider task files.
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

  const handleRepositoryChange = (nextRepositoryFullName: string | null) => {
    if (!nextRepositoryFullName || !repositoryPreferenceKey) {
      return;
    }

    writeCatFileRepositoryPreference(repositoryPreferenceKey, nextRepositoryFullName);
    setRepositoryOverride(nextRepositoryFullName);
  };

  return (
    <main className="-mx-4 -my-5 flex min-h-[calc(100svh-var(--app-shell-header-height))] flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" render={<Link href={taskHref} />}>
              <ArrowLeftIcon />
              Task
            </Button>
            <div className="min-w-0">
              <TypographyP className="truncate text-xs text-muted-foreground">
                {selectedFile.provider.kind} · {selectedFile.provider.format ?? "file"}
              </TypographyP>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <TypographyP className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Source file
            </TypographyP>
            <Select value={selectedFile.sourcePath} onValueChange={handleFileChange}>
              <SelectTrigger className="h-9 w-full font-mono text-xs">
                <SelectValue placeholder="Select file" />
              </SelectTrigger>
              <SelectContent>
                {providerFiles.map((file) => (
                  <SelectItem key={file.sourcePath} value={file.sourcePath}>
                    {file.sourcePath}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {enabledRepositoryFullNames.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <TypographyP className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                GitHub repository
              </TypographyP>
              <Select
                value={selectedRepositoryFullName ?? ""}
                onValueChange={handleRepositoryChange}
              >
                <SelectTrigger className="h-9 w-full font-mono text-xs">
                  <SelectValue placeholder="Select repository" />
                </SelectTrigger>
                <SelectContent>
                  {enabledRepositoryFullNames.map((repositoryFullName) => (
                    <SelectItem key={repositoryFullName} value={repositoryFullName}>
                      {repositoryFullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {repositoriesQuery.isError ? (
          <TypographyP className="text-xs text-muted-foreground">
            GitHub repositories could not be loaded. Repository context lookup is unavailable.
          </TypographyP>
        ) : null}

        {enabledRepositoryFullNames.length > 1 && !selectedRepositoryFullName ? (
          <TypographyP className="text-xs text-muted-foreground">
            Select a GitHub repository to look up string context for this file.
          </TypographyP>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8">
        <TmsJobCatWorkspace
          key={`${selectedFile.sourcePath}:${selectedRepositoryFullName ?? "default"}`}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourcePath={selectedFile.sourcePath}
          targetLocale={selectedTargetLocale}
          repositoryFullName={selectedRepositoryFullName}
        />
      </div>
    </main>
  );
}
