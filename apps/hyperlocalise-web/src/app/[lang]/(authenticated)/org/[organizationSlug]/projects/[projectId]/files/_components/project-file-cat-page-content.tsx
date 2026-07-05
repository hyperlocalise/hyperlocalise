"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { ProjectFileCatWorkspace } from "@/components/cat/project-file/project-file-cat-workspace";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { apiClient } from "@/lib/api-client-instance";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
  hasProjectFileCatIdentityFromUrl,
} from "@/lib/projects/project-file-cat-routing";

import { ProjectPageShell, useProjectPageQuery } from "../../_components/project-page-shell";
import {
  catFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "../../jobs/[jobId]/strings/_components/job-cat-repository-preference";
import { selectJobCatTargetLocale } from "../../jobs/[jobId]/strings/_components/job-cat-target-locale";
import {
  canLookupFreshCatRepositoryContext,
  selectJobCatRepository,
} from "../../jobs/[jobId]/strings/_components/select-job-cat-repository";
import {
  fetchProjectFiles,
  findCachedProjectFiles,
  PROJECT_FILES_MAX_LIMIT,
  projectFilesQueryKey,
  sortFilesByPath,
} from "./project-files-tree-panel";
import { CatFileTreePicker, CatRepositorySelect } from "./cat-header-pickers";

type ProjectFileCatGithubRepository = {
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

function githubInstallationRepositoriesQueryKey(organizationSlug: string) {
  return ["github-installation-repositories", organizationSlug] as const;
}

export function ProjectFileCatPageContent({
  organizationSlug,
  projectId,
  sourcePath,
  highlightLocale,
  initialSegmentKey = null,
  externalResourceId = null,
  resourceType = null,
  branch = null,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string | null;
  highlightLocale: string | null;
  initialSegmentKey?: string | null;
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  branch?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasFileReference = Boolean(sourcePath);
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, {
    enabled: hasFileReference,
  });
  const filesHref = useMemo(() => {
    const params = new URLSearchParams();
    if (sourcePath) {
      params.set("sourcePath", sourcePath);
    }
    if (highlightLocale) {
      params.set("locale", highlightLocale);
    }
    if (branch) {
      params.set("branch", branch);
    }
    const query = params.toString();
    return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files${
      query ? `?${query}` : ""
    }`;
  }, [branch, highlightLocale, organizationSlug, projectId, sourcePath]);
  const canOpenFromUrlIdentity = hasProjectFileCatIdentityFromUrl({
    sourcePath,
    externalResourceId,
    highlightLocale,
  });

  const filesQuery = useQuery({
    queryKey: projectFilesQueryKey(organizationSlug, projectId, PROJECT_FILES_MAX_LIMIT, branch),
    queryFn: () => fetchProjectFiles(organizationSlug, projectId, PROJECT_FILES_MAX_LIMIT, branch),
    enabled: hasFileReference,
    placeholderData: () => findCachedProjectFiles(queryClient, organizationSlug, projectId, branch),
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

      const body = (await response.json()) as { repositories: ProjectFileCatGithubRepository[] };
      return body.repositories;
    },
  });

  const catFiles = useMemo(
    () => sortFilesByPath(filesQuery.data ?? []).filter((entry) => canOpenProjectFileCat(entry)),
    [filesQuery.data],
  );

  const enabledRepositoryFullNames = useMemo(
    () =>
      (repositoriesQuery.data ?? [])
        .filter((repository) => repository.enabled && !repository.archived)
        .map((repository) => repository.fullName),
    [repositoriesQuery.data],
  );

  const repositoryPreferenceKey = sourcePath
    ? catFileRepositoryPreferenceKey(organizationSlug, projectId, sourcePath)
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
  useAppShellSidebar({
    forceCollapsed: hasFileReference,
    preferredOpen: hasFileReference ? false : null,
  });

  if (!sourcePath) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            Choose a source file from the project files list to open it in the CAT workspace.
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  if (projectQuery.isLoading || (!canOpenFromUrlIdentity && filesQuery.isLoading)) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">Loading file…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (projectQuery.isError || (!canOpenFromUrlIdentity && filesQuery.isError)) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-flame-100">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : filesQuery.error instanceof Error
                ? filesQuery.error.message
                : "Unable to load project files."}
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  const file =
    filesQuery.data?.find((entry) => entry.sourcePath === sourcePath) ??
    (canOpenFromUrlIdentity && externalResourceId
      ? (filesQuery.data?.find(
          (entry) => entry.provider?.externalResourceId === externalResourceId,
        ) ?? null)
      : null);

  const resolvedExternalResourceId =
    externalResourceId ?? file?.provider?.externalResourceId ?? null;
  const resolvedResourceType = resourceType ?? file?.provider?.resourceType;

  if (!canOpenFromUrlIdentity && !file) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="font-mono text-sm text-foreground">{sourcePath}</TypographyP>
          <TypographyP className="mt-2 text-sm text-muted-foreground">
            This source file is not in the project file list anymore.
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  if (file?.provider && !supportsProviderCatFile(file)) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            The CAT workspace is not available for this provider file type yet.
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  const targetLocale = file?.provider
    ? selectJobCatTargetLocale({
        requestedTargetLocale: highlightLocale,
        providerTargetLocales: file.provider.targetLocales,
      })
    : highlightLocale;

  if (!targetLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            Choose a target locale to open this file in the CAT workspace.
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
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
          <TypographyP className="text-sm text-muted-foreground">Loading file…</TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const handleFileChange = (nextSourcePath: string | null) => {
    if (!nextSourcePath) {
      return;
    }

    const nextFile = catFiles.find((entry) => entry.sourcePath === nextSourcePath);
    if (!nextFile) {
      return;
    }

    const href = buildProjectFileCatHref(
      organizationSlug,
      projectId,
      nextFile,
      highlightLocale,
      branch,
    );
    if (href) {
      router.push(href);
    }
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-8 shrink-0"
          render={<Link href={filesHref} />}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>

        {catFiles.length > 0 ? (
          <CatFileTreePicker
            files={catFiles}
            selectedSourcePath={sourcePath}
            onSelectFile={handleFileChange}
          />
        ) : (
          <TypographyP className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {sourcePath}
          </TypographyP>
        )}

        {enabledRepositoryFullNames.length > 0 ? (
          <CatRepositorySelect
            repositoryFullNames={enabledRepositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}

        {file?.provider ? (
          <TypographyP className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block lg:max-w-48">
            {file.provider.kind} · {file.provider.format ?? "file"}
          </TypographyP>
        ) : null}
      </div>

      {(repositoriesQuery.isError ||
        (enabledRepositoryFullNames.length > 1 && !selectedRepositoryFullName)) && (
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
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
        <ProjectFileCatWorkspace
          key={`${sourcePath}:${resolvedExternalResourceId ?? "source-path"}:${targetLocale}:${selectedRepositoryFullName ?? "default"}`}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          sourcePath={sourcePath}
          externalResourceId={resolvedExternalResourceId}
          resourceType={resolvedResourceType}
          targetLocale={targetLocale}
          targetLocales={file?.provider?.targetLocales}
          highlightLocale={highlightLocale}
          repositoryFullName={selectedRepositoryFullName}
          canLookupFreshContext={canLookupFreshCatRepositoryContext(
            enabledRepositoryFullNames,
            selectedRepositoryFullName,
          )}
          initialSegmentKey={initialSegmentKey}
          layout="fullscreen"
          className="min-h-0 flex-1"
        />
      </div>
    </main>
  );
}
