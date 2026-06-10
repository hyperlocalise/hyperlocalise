"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import { ProjectPageShell } from "../../../../_components/project-page-shell";
import { tmsLiveFileToProjectFileRecord } from "../../_components/tms/job-source-file-mappers";
import { selectJobCatTargetLocale } from "./job-cat-target-locale";
import { TmsJobCatWorkspace } from "./tms-job-cat-workspace";

function tmsLiveJobFilesQueryKey(organizationSlug: string, encodedJobId: string) {
  return ["tms-provider-job-files", organizationSlug, encodedJobId] as const;
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

  const selectedFile = sourcePath
    ? (filesQuery.data ?? []).find((file) => file.sourcePath === sourcePath)
    : null;

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

  if (filesQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">Loading task file…</TypographyP>
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

  return (
    <main className="-mx-4 -my-5 flex min-h-[calc(100svh-var(--app-shell-header-height))] flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" render={<Link href={taskHref} />}>
            <ArrowLeftIcon />
            Task
          </Button>
          <div className="min-w-0">
            <TypographyP className="truncate font-mono text-sm font-medium text-foreground">
              {selectedFile.sourcePath}
            </TypographyP>
            <TypographyP className="truncate text-xs text-muted-foreground">
              {selectedFile.provider.kind} · {selectedFile.provider.format ?? "file"}
            </TypographyP>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8">
        <TmsJobCatWorkspace
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourcePath={selectedFile.sourcePath}
          targetLocale={selectedTargetLocale}
        />
      </div>
    </main>
  );
}
