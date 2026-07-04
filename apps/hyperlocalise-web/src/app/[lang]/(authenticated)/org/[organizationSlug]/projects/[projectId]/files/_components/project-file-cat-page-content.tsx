"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { ProjectFileCatWorkspace } from "@/components/cat/project-file/project-file-cat-workspace";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";
import { hasProjectFileCatIdentityFromUrl } from "@/lib/projects/project-file-cat-routing";

import { ProjectPageShell, useProjectPageQuery } from "../../_components/project-page-shell";
import { selectJobCatTargetLocale } from "../../jobs/[jobId]/strings/_components/job-cat-target-locale";
import {
  fetchProjectFiles,
  findCachedProjectFiles,
  projectFilesQueryKey,
} from "./project-files-tree-panel";

export function ProjectFileCatPageContent({
  organizationSlug,
  projectId,
  sourcePath,
  highlightLocale,
  initialSegmentKey = null,
  externalResourceId = null,
  resourceType = null,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string | null;
  highlightLocale: string | null;
  initialSegmentKey?: string | null;
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
}) {
  const queryClient = useQueryClient();
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, {
    enabled: Boolean(sourcePath),
  });
  const filesHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files${
    sourcePath ? `?sourcePath=${encodeURIComponent(sourcePath)}` : ""
  }`;
  const canOpenFromUrlIdentity = hasProjectFileCatIdentityFromUrl({
    sourcePath,
    externalResourceId,
    highlightLocale,
  });

  const filesQuery = useQuery({
    queryKey: projectFilesQueryKey(organizationSlug, projectId),
    queryFn: () => fetchProjectFiles(organizationSlug, projectId),
    enabled: Boolean(sourcePath) && !canOpenFromUrlIdentity,
    placeholderData: () => findCachedProjectFiles(queryClient, organizationSlug, projectId),
  });
  useAppShellSidebar({
    forceCollapsed: Boolean(sourcePath),
    preferredOpen: sourcePath ? false : null,
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
  const sourceLocale = projectQuery.data?.sourceLocale;

  if (!sourceLocale) {
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

  return (
    <main className="-mx-4 -my-5 flex min-h-[calc(100svh-var(--app-shell-header-height))] flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" render={<Link href={filesHref} />}>
            <ArrowLeftIcon />
            Files
          </Button>
          <TypographyP className="truncate font-mono text-xs text-muted-foreground">
            {sourcePath}
          </TypographyP>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8">
        <ProjectFileCatWorkspace
          key={`${sourcePath}:${resolvedExternalResourceId ?? "source-path"}:${targetLocale}`}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          sourcePath={sourcePath}
          externalResourceId={resolvedExternalResourceId}
          resourceType={resolvedResourceType}
          targetLocale={targetLocale}
          targetLocales={file?.provider?.targetLocales}
          highlightLocale={highlightLocale}
          initialSegmentKey={initialSegmentKey}
          layout="fullscreen"
        />
      </div>
    </main>
  );
}
