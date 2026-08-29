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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { ProjectFileContentEditorWorkspace } from "@/components/content-editor/project-file/project-file-content-editor-workspace";
import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { apiClient } from "@/lib/api-client-instance";
import { supportsProviderContentEditorFile } from "@/lib/providers/capabilities/provider-content-editor-capabilities";
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";
import {
  buildProjectFileContentEditorAllFilesHref,
  buildProjectFileContentEditorHref,
  canOpenProjectFileContentEditor,
  hasProjectFileContentEditorIdentityFromUrl,
  resolveProjectContentEditorTargetLocale,
  resolveProjectFileContentEditorTargetLocale,
  resolveProjectFileContentEditorTargetLocaleResolution,
  resolveProjectFileContentEditorTargetLocales,
} from "@/lib/projects/project-file-content-editor-routing";
import { buildCatNavigationSearchParams } from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";

import { ProjectPageShell, useProjectPageQuery } from "../../_components/project-page-shell";
import {
  contentEditorFileRepositoryPreferenceKey,
  readCatFileRepositoryPreference,
  writeCatFileRepositoryPreference,
} from "../../jobs/[jobId]/strings/_components/job-content-editor-repository-preference";
import {
  canLookupFreshCatRepositoryContext,
  selectJobContentEditorRepository,
} from "../../jobs/[jobId]/strings/_components/select-job-content-editor-repository";
import {
  fetchProjectFiles,
  findCachedProjectFiles,
  PROJECT_FILES_MAX_LIMIT,
  projectFilesQueryKey,
  sortFilesByPath,
} from "./project-files-tree-panel";
import { projectFileCatPageContentMessages as messages } from "./project-file-content-editor-page-content.messages";
import {
  ContentEditorFileTreePicker,
  ContentEditorLocaleSelect,
} from "../../_components/content-editor-header-pickers";

type ProjectFileContentEditorGithubRepository = {
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

function githubInstallationRepositoriesQueryKey(organizationSlug: string) {
  return ["github-installation-repositories", organizationSlug] as const;
}

export function ProjectFileContentEditorPageContent({
  organizationSlug,
  projectId,
  sourcePath,
  allFiles = false,
  contentEditorAllFilesEnabled = false,
  highlightLocale,
  initialSegmentKey = null,
  initialQueueFilter = "all",
  initialQueueSort = "file_order",
  initialSearch = "",
  externalResourceId = null,
  resourceType = null,
  branch = null,
  sourcePaths = null,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string | null;
  allFiles?: boolean;
  contentEditorAllFilesEnabled?: boolean;
  highlightLocale: string | null;
  initialSegmentKey?: string | null;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  branch?: string | null;
  sourcePaths?: string | null;
}) {
  const intl = useIntl();
  const router = useRouter();
  const pageNavigationGuardRef = useRef<ContentEditorPageNavigationGuardRef["current"]>(null);
  const queryClient = useQueryClient();
  const hasFileReference = Boolean(sourcePath) || allFiles;
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
  const canOpenFromUrlIdentity = hasProjectFileContentEditorIdentityFromUrl({
    sourcePath,
    externalResourceId,
    highlightLocale,
  });

  const filesQuery = useQuery({
    queryKey: projectFilesQueryKey(organizationSlug, projectId, PROJECT_FILES_MAX_LIMIT, branch),
    queryFn: () =>
      fetchProjectFiles(
        organizationSlug,
        projectId,
        PROJECT_FILES_MAX_LIMIT,
        branch,
        intl.formatMessage(messages.unableToLoad),
      ),
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
        throw new Error(intl.formatMessage(messages.loadRepositoriesFailed));
      }

      const body = (await response.json()) as {
        repositories: ProjectFileContentEditorGithubRepository[];
      };
      return body.repositories;
    },
  });

  const contentEditorFiles = useMemo(
    () =>
      sortFilesByPath(filesQuery.data ?? []).filter((entry) =>
        canOpenProjectFileContentEditor(entry),
      ),
    [filesQuery.data],
  );

  const canUseAllFiles = contentEditorAllFilesEnabled;

  useEffect(() => {
    if (!allFiles || canUseAllFiles || !projectQuery.data) {
      return;
    }

    const fallbackFile = contentEditorFiles[0];
    if (!fallbackFile) {
      router.replace(filesHref);
      return;
    }

    const href = buildProjectFileContentEditorHref(
      organizationSlug,
      projectId,
      fallbackFile,
      highlightLocale,
      branch,
      projectQuery.data.targetLocales,
    );
    if (href) {
      router.replace(href);
    }
  }, [
    allFiles,
    branch,
    canUseAllFiles,
    contentEditorFiles,
    filesHref,
    highlightLocale,
    organizationSlug,
    projectId,
    projectQuery.data,
    router,
  ]);

  const enabledRepositoryFullNames = useMemo(
    () =>
      (repositoriesQuery.data ?? [])
        .filter((repository) => repository.enabled && !repository.archived)
        .map((repository) => repository.fullName),
    [repositoriesQuery.data],
  );

  const repositoryPreferencePath = allFiles ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH : sourcePath;
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
  useAppShellSidebar({
    forceCollapsed: hasFileReference,
    preferredOpen: hasFileReference ? false : null,
  });

  useEffect(() => {
    if (!allFiles || highlightLocale || !projectQuery.data) {
      return;
    }

    const resolved = resolveProjectContentEditorTargetLocale(projectQuery.data.targetLocales, null);
    if (!resolved) {
      return;
    }

    router.replace(
      buildProjectFileContentEditorAllFilesHref(organizationSlug, projectId, resolved, {
        branch,
        sourcePaths: sourcePaths ? sourcePaths.split(",") : null,
        basePath: "strings",
      }),
    );
  }, [
    allFiles,
    branch,
    highlightLocale,
    organizationSlug,
    projectId,
    projectQuery.data,
    router,
    sourcePaths,
  ]);

  if (!sourcePath && !allFiles) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.chooseSourceFile} />
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <FormattedMessage {...messages.files} />
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
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.loadingFile} />
          </TypographyP>
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
                : intl.formatMessage(messages.unableToLoad)}
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <FormattedMessage {...messages.files} />
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

  if (!allFiles && !canOpenFromUrlIdentity && !file) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="font-mono text-sm text-foreground">{sourcePath}</TypographyP>
          <TypographyP className="mt-2 text-sm text-muted-foreground">
            <FormattedMessage {...messages.sourceFileMissing} />
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <FormattedMessage {...messages.files} />
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  if (!allFiles && file?.provider && !supportsProviderContentEditorFile(file)) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.providerTypeUnsupported} />
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <FormattedMessage {...messages.files} />
          </Button>
        </div>
      </ProjectPageShell>
    );
  }

  const projectTargetLocales = projectQuery.data?.targetLocales;
  const workspaceTargetLocales = allFiles
    ? [...(projectTargetLocales ?? [])]
    : file
      ? resolveProjectFileContentEditorTargetLocales(file, projectTargetLocales)
      : [];
  const targetLocaleResolution = allFiles
    ? {
        requestedLocale: highlightLocale,
        status: (highlightLocale && workspaceTargetLocales.includes(highlightLocale)
          ? "exact"
          : workspaceTargetLocales[0]
            ? "fallback"
            : "none") as "exact" | "fallback" | "none",
        targetLocale: resolveProjectContentEditorTargetLocale(
          projectTargetLocales,
          highlightLocale,
        ),
        targetLocales: workspaceTargetLocales,
      }
    : file
      ? resolveProjectFileContentEditorTargetLocaleResolution(
          file,
          highlightLocale,
          projectTargetLocales,
        )
      : {
          requestedLocale: highlightLocale,
          status: highlightLocale ? ("exact" as const) : ("none" as const),
          targetLocale: highlightLocale,
          targetLocales: [],
        };
  const targetLocale = targetLocaleResolution.targetLocale;
  const localeFallbackMessage =
    targetLocaleResolution.status === "fallback" &&
    targetLocaleResolution.requestedLocale &&
    targetLocaleResolution.requestedLocale !== targetLocale
      ? intl.formatMessage(messages.localeFallback, {
          requestedLocale: targetLocaleResolution.requestedLocale,
          targetLocale,
        })
      : null;

  if (!targetLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.chooseTargetLocale} />
          </TypographyP>
          <Button className="mt-4" variant="outline" size="sm" render={<Link href={filesHref} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <FormattedMessage {...messages.files} />
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
            <FormattedMessage {...messages.missingSourceLocale} />
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
            <FormattedMessage {...messages.loadingFile} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const handleFileChange = (nextSourcePath: string | null) => {
    if (!nextSourcePath) {
      return;
    }

    const nextFile = contentEditorFiles.find((entry) => entry.sourcePath === nextSourcePath);
    if (!nextFile) {
      return;
    }

    const nextLocale = resolveProjectFileContentEditorTargetLocale(
      nextFile,
      targetLocale ?? highlightLocale,
      projectTargetLocales,
    );
    const params = buildCatNavigationSearchParams(window.location.search, {
      sourcePath: nextFile.sourcePath,
      locale: nextLocale,
      externalResourceId: nextFile.provider?.externalResourceId ?? null,
      resourceType:
        nextFile.provider?.resourceType && nextFile.provider.resourceType !== "file"
          ? nextFile.provider.resourceType
          : null,
      branch,
      segment: null,
    });
    router.push(
      `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/content-editor?${params.toString()}`,
    );
  };

  const handleSelectAllFiles = () => {
    const params = buildCatNavigationSearchParams(window.location.search, {
      sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
      locale: targetLocale ?? highlightLocale,
      externalResourceId: null,
      resourceType: null,
      branch,
      segment: null,
    });
    router.push(
      `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/strings?${params.toString()}`,
    );
  };

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

  const handleLocaleChange = (nextLocale: string) => {
    if (nextLocale === targetLocale) {
      return;
    }

    const navigate = () => {
      if (allFiles) {
        const params = buildCatNavigationSearchParams(window.location.search, {
          locale: nextLocale,
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
        });
        const section = "strings";
        router.push(
          `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/${section}?${params.toString()}`,
        );
        return;
      }

      if (!sourcePath) {
        return;
      }

      const params = buildCatNavigationSearchParams(window.location.search, {
        sourcePath,
        locale: nextLocale,
        externalResourceId: resolvedExternalResourceId,
        resourceType:
          resolvedResourceType && resolvedResourceType !== "file" ? resolvedResourceType : null,
        branch,
      });

      router.push(
        `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/content-editor?${params.toString()}`,
      );
    };

    attemptCatPageNavigation(pageNavigationGuardRef, navigate);
  };

  return (
    <main className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            render={<Link href={filesHref} />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>

          {contentEditorFiles.length > 0 || allFiles ? (
            <ContentEditorFileTreePicker
              files={contentEditorFiles}
              selectedSourcePath={sourcePath ?? ""}
              onSelectFile={handleFileChange}
              allFilesSelected={allFiles}
              onSelectAllFiles={canUseAllFiles ? handleSelectAllFiles : undefined}
              repositoryFullNames={enabledRepositoryFullNames}
              selectedRepositoryFullName={selectedRepositoryFullName}
              onRepositoryChange={handleRepositoryChange}
            />
          ) : (
            <TypographyP className="max-w-44 truncate font-mono text-xs text-muted-foreground">
              {sourcePath}
            </TypographyP>
          )}

          {workspaceTargetLocales.length > 0 ? (
            <ContentEditorLocaleSelect
              targetLocales={workspaceTargetLocales}
              selectedTargetLocale={targetLocale}
              onTargetLocaleChange={handleLocaleChange}
            />
          ) : null}
        </div>

        <ContentEditorQueueToolbarHost />
      </div>

      {(repositoriesQuery.isError ||
        (enabledRepositoryFullNames.length > 1 && !selectedRepositoryFullName)) && (
        <div className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4 lg:px-6">
          {repositoriesQuery.isError ? (
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.repositoriesLoadFailed} />
            </TypographyP>
          ) : (
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.selectRepositoryForContext} />
            </TypographyP>
          )}
        </div>
      )}

      {localeFallbackMessage ? (
        <div className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4 lg:px-6">
          <TypographyP className="text-xs text-muted-foreground">
            {localeFallbackMessage}
          </TypographyP>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6">
        <ProjectFileContentEditorWorkspace
          key={`${allFiles ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH : sourcePath}:${resolvedExternalResourceId ?? "source-path"}:${targetLocale}`}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          sourcePath={allFiles ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH : (sourcePath as string)}
          externalResourceId={allFiles ? null : resolvedExternalResourceId}
          resourceType={allFiles ? undefined : resolvedResourceType}
          targetLocale={targetLocale}
          targetLocales={workspaceTargetLocales}
          highlightLocale={highlightLocale}
          repositoryFullName={selectedRepositoryFullName}
          canLookupFreshContext={canLookupFreshCatRepositoryContext(
            enabledRepositoryFullNames,
            selectedRepositoryFullName,
          )}
          initialSegmentKey={initialSegmentKey}
          initialQueueFilter={initialQueueFilter}
          initialQueueSort={initialQueueSort}
          initialSearch={initialSearch}
          sourcePathsFilter={sourcePaths}
          layout="fullscreen"
          className="min-h-0 flex-1"
          pageNavigationGuardRef={pageNavigationGuardRef}
        />
      </div>
    </main>
  );
}
