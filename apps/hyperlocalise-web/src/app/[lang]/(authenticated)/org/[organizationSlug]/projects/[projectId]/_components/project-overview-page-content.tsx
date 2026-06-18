"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  File01Icon,
  Settings02Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { OverviewActionCard } from "../../../_components/overview/overview-action-card";
import {
  computeProjectPendingActionCount,
  countFilesNeedingAttention,
  selectFilesNeedingAttention,
  selectOngoingJobs,
} from "../../../_components/overview/overview-attention";
import { OverviewHeroCard } from "../../../_components/overview/overview-hero-card";
import { OverviewSectionHeader } from "../../../_components/overview/overview-section-header";
import { OverviewSnapshotCard } from "../../../_components/overview/overview-snapshot-card";
import {
  formatRelativeTimestamp,
  providerLabel,
  summarizeLocaleReadiness,
} from "../../../_components/workspace-files-shared";
import type { Tone } from "../../../_components/workspace-resource-shared";
import { getJobName, jobTone, type ApiJob } from "../../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../_components/project-list";
import { ProjectPageShell, useProjectPageQuery } from "./project-page-shell";

function buildProjectJobHref(organizationSlug: string, projectId: string, jobId: string) {
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

function buildProjectFileHref(organizationSlug: string, projectId: string, sourcePath: string) {
  const base = buildProjectPath(organizationSlug, projectId, "files");
  const params = new URLSearchParams({ sourcePath });
  return `${base}?${params.toString()}`;
}

function formatLocaleRoute(sourceLocale: string | null, targetLocales: readonly string[]) {
  const source = sourceLocale ?? "—";
  if (targetLocales.length === 0) {
    return source;
  }

  const preview = targetLocales.slice(0, 3).join(", ");
  const suffix = targetLocales.length > 3 ? ` +${targetLocales.length - 3}` : "";
  return `${source} → ${preview}${suffix}`;
}

function buildHeroCopy(
  project: ProjectListRow,
  filesNeedingAttention: number,
  pendingCount: number,
) {
  if (pendingCount === 0) {
    return {
      title: "You're all caught up",
      description:
        "No pending actions right now. Upload source files or review completed jobs when you're ready to continue.",
      ctaLabel: "Browse files",
      ctaHref: "files",
    };
  }

  const parts: string[] = [];
  if (project.openJobCount > 0) {
    parts.push(`${project.openJobCount} open ${project.openJobCount === 1 ? "job" : "jobs"}`);
  }
  if (project.lastSyncErrorAt) {
    parts.push("sync issue");
  }
  if (filesNeedingAttention > 0) {
    parts.push(
      `${filesNeedingAttention} ${filesNeedingAttention === 1 ? "file" : "files"} needing attention`,
    );
  }

  return {
    title: "A few things need your attention",
    description: `Pick up where you left off — ${parts.join(", ")}.`,
    ctaLabel: "Pick up where you left off",
    ctaHref: "jobs",
  };
}

function formatJobStatusLine(job: ApiJob) {
  return `${job.status.replaceAll("_", " ")} · updated ${formatRelativeTimestamp(job.updatedAt)}`;
}

function formatFileStatusLine(file: ProjectFileRecord) {
  const summary = summarizeLocaleReadiness(file.provider?.localeReadiness ?? {});
  return summary ?? "Needs attention";
}

function fileStatusTone(file: ProjectFileRecord): Tone {
  const readiness = file.provider?.localeReadiness ?? {};
  const hasMissing = Object.values(readiness).some(
    (value) => value === "missing" || value === "stale",
  );
  if (hasMissing) {
    return "watch";
  }
  return "info";
}

export type ProjectOverviewPageContentViewProps = {
  organizationSlug: string;
  projectId: string;
  project: ProjectListRow | null;
  isProjectLoading: boolean;
  isProjectError: boolean;
  jobs: readonly ApiJob[];
  isJobsLoading: boolean;
  isJobsError: boolean;
  files: readonly ProjectFileRecord[];
  isFilesLoading: boolean;
  isFilesError: boolean;
};

export function ProjectOverviewPageContentView({
  organizationSlug,
  projectId,
  project,
  isProjectLoading,
  isProjectError,
  jobs,
  isJobsLoading,
  isJobsError,
  files,
  isFilesLoading,
  isFilesError,
}: ProjectOverviewPageContentViewProps) {
  const filesNeedingAttention = countFilesNeedingAttention(files);
  const pendingCount = project ? computeProjectPendingActionCount(project, files) : 0;
  const ongoingJobs = selectOngoingJobs(jobs);
  const attentionFiles = selectFilesNeedingAttention(files);
  const ongoingCount = ongoingJobs.length + attentionFiles.length;

  const heroCopy = project ? buildHeroCopy(project, filesNeedingAttention, pendingCount) : null;

  const projectDescription =
    project?.descriptionValue ||
    project?.translationContextValue ||
    "Project hub for localization work.";

  const snapshotRows = project
    ? [
        {
          label: "Locales",
          value: formatLocaleRoute(project.sourceLocale, project.targetLocales),
        },
        {
          label: "Source",
          value:
            project.source === "external_tms" && project.externalProviderKind
              ? providerLabel(project.externalProviderKind)
              : "Native project",
        },
        {
          label: "Last sync",
          value: project.lastSyncedAt
            ? formatRelativeTimestamp(project.lastSyncedAt)
            : "Not synced yet",
        },
        {
          label: "Open jobs",
          value: String(project.openJobCount),
        },
      ]
    : [];

  return (
    <ProjectPageShell className="gap-8">
      <header className="space-y-2">
        {isProjectLoading ? (
          <>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </>
        ) : isProjectError ? (
          <>
            <TypographyH1 className="font-sans text-2xl font-medium text-foreground">
              Project overview
            </TypographyH1>
            <TypographyP className="text-sm text-muted-foreground">
              Unable to load project details. Refresh the page or try again in a moment.
            </TypographyP>
          </>
        ) : (
          <>
            <TypographyH1 className="font-sans text-2xl font-medium text-foreground">
              {project?.name ?? "Project"}
            </TypographyH1>
            <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {projectDescription}
            </TypographyP>
          </>
        )}
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {isProjectLoading ? (
          <>
            <Skeleton className="min-h-52 rounded-2xl lg:col-span-2" />
            <Skeleton className="min-h-52 rounded-2xl" />
          </>
        ) : project && heroCopy ? (
          <>
            <OverviewHeroCard
              className="lg:col-span-2"
              pendingCount={pendingCount}
              title={heroCopy.title}
              description={heroCopy.description}
              ctaLabel={heroCopy.ctaLabel}
              ctaHref={buildProjectPath(organizationSlug, projectId, heroCopy.ctaHref)}
            />
            <OverviewSnapshotCard
              title="Project snapshot"
              rows={snapshotRows}
              ctaLabel="View settings"
              ctaHref={buildProjectPath(organizationSlug, projectId, "settings")}
            />
          </>
        ) : null}
      </section>

      <section className="space-y-4">
        <OverviewSectionHeader title="Ongoing" count={ongoingCount} />

        <div className="grid gap-4 md:grid-cols-2">
          {isJobsLoading || isFilesLoading ? (
            <>
              <Skeleton className="min-h-44 rounded-2xl" />
              <Skeleton className="min-h-44 rounded-2xl" />
            </>
          ) : (
            <>
              {ongoingJobs.length > 0 ? (
                ongoingJobs.map((job) => (
                  <OverviewActionCard
                    key={job.id}
                    category="Job"
                    title={getJobName(job)}
                    statusLine={formatJobStatusLine(job)}
                    statusTone={jobTone(job.status)}
                    viewHref={buildProjectJobHref(organizationSlug, projectId, job.id)}
                  />
                ))
              ) : (
                <Card className="rounded-2xl border border-dashed border-foreground/10 bg-foreground/2 py-0 ring-0">
                  <CardContent className="flex h-full flex-col justify-between gap-4 px-5 py-5">
                    <div>
                      <TypographyP className="text-sm font-medium text-foreground">
                        {isJobsError ? "Jobs unavailable" : "No active jobs"}
                      </TypographyP>
                      <TypographyP className="mt-1 text-sm text-muted-foreground">
                        {isJobsError
                          ? "We could not load jobs for this project."
                          : "Queued, running, and review jobs will appear here."}
                      </TypographyP>
                    </div>
                    <Button
                      nativeButton={false}
                      render={<Link href={buildProjectPath(organizationSlug, projectId, "jobs")} />}
                      variant="outline"
                      size="sm"
                      className="w-fit rounded-full"
                    >
                      View jobs
                    </Button>
                  </CardContent>
                </Card>
              )}

              {attentionFiles.length > 0 ? (
                attentionFiles.map((file) => (
                  <OverviewActionCard
                    key={file.sourcePath}
                    category="File"
                    title={file.filename}
                    statusLine={formatFileStatusLine(file)}
                    statusTone={fileStatusTone(file)}
                    viewHref={buildProjectFileHref(organizationSlug, projectId, file.sourcePath)}
                  />
                ))
              ) : (
                <Card className="rounded-2xl border border-dashed border-foreground/10 bg-foreground/2 py-0 ring-0">
                  <CardContent className="flex h-full flex-col justify-between gap-4 px-5 py-5">
                    <div>
                      <TypographyP className="text-sm font-medium text-foreground">
                        {isFilesError ? "Files unavailable" : "No files need attention"}
                      </TypographyP>
                      <TypographyP className="mt-1 text-sm text-muted-foreground">
                        {isFilesError
                          ? "We could not load project files."
                          : "Files with missing or changed translations will appear here."}
                      </TypographyP>
                    </div>
                    <Button
                      nativeButton={false}
                      render={
                        <Link href={buildProjectPath(organizationSlug, projectId, "files")} />
                      }
                      variant="outline"
                      size="sm"
                      className="w-fit rounded-full"
                    >
                      View files
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </section>

      {project ? (
        <Card
          className={cn(
            "rounded-2xl border py-0 ring-0",
            project.lastSyncErrorAt
              ? "border-flame-700/20 bg-flame-700/10"
              : "border-foreground/8 bg-foreground/2.5",
          )}
        >
          <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {project.lastSyncErrorAt ? (
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  strokeWidth={1.8}
                  className="mt-0.5 size-5 shrink-0 text-flame-100"
                />
              ) : null}
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  {project.lastSyncErrorAt ? "Sync needs attention" : "Sync health"}
                </TypographyP>
                <TypographyP className="mt-1 text-sm text-muted-foreground">
                  {project.lastSyncErrorAt
                    ? (project.lastSyncErrorMessage ?? "The last provider sync reported an error.")
                    : project.lastSyncedAt
                      ? `Last synced ${formatRelativeTimestamp(project.lastSyncedAt)}.`
                      : "This project has not synced with a provider yet."}
                </TypographyP>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                nativeButton={false}
                render={<Link href={buildProjectPath(organizationSlug, projectId, "jobs")} />}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} />
                Jobs
              </Button>
              <Button
                nativeButton={false}
                render={<Link href={buildProjectPath(organizationSlug, projectId, "files")} />}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />
                Files
              </Button>
              <Button
                nativeButton={false}
                render={<Link href={buildProjectPath(organizationSlug, projectId, "settings")} />}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} />
                Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </ProjectPageShell>
  );
}

export function ProjectOverviewPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);

  const jobsQuery = useQuery({
    queryKey: ["project-overview-jobs", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$get({
        param: { organizationSlug, projectId },
        query: { limit: "5" },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load project jobs");
      }
      const body = (await response.json()) as { jobs: ApiJob[] };
      return body.jobs;
    },
  });

  const filesQuery = useQuery({
    queryKey: ["project-overview-files", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
        query: { limit: "10" },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load project files");
      }
      const body = (await response.json()) as { files: ProjectFileRecord[] };
      return body.files;
    },
  });

  return (
    <ProjectOverviewPageContentView
      organizationSlug={organizationSlug}
      projectId={projectId}
      project={projectQuery.data ?? null}
      isProjectLoading={projectQuery.isLoading}
      isProjectError={projectQuery.isError}
      jobs={jobsQuery.data ?? []}
      isJobsLoading={jobsQuery.isLoading}
      isJobsError={jobsQuery.isError}
      files={filesQuery.data ?? []}
      isFilesLoading={filesQuery.isLoading}
      isFilesError={filesQuery.isError}
    />
  );
}
