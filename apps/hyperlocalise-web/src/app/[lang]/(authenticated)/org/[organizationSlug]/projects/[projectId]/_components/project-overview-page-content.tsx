"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { parseApiJsonResponse, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import {
  projectFilesResponseSchema,
  type ProjectFileRecord,
} from "@/api/routes/project/project.schema";

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
import {
  countReadyLocales,
  resolveFileLocaleReadiness,
} from "@/lib/projects/files/native-locale-readiness";
import type { Tone } from "../../../_components/workspace-resource-shared";
import { getJobName, jobTone, type ApiJob } from "../../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../_components/project-list";
import { ProjectPageShell, useProjectPageQuery } from "./project-page-shell";
import { useProjectOpenJobCountQuery } from "./use-project-open-job-count";
import { useProjectOverviewJobsQuery } from "./use-project-overview-jobs";

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

function buildHeroCopy(filesNeedingAttention: number, pendingCount: number, openJobCount: number) {
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
  if (openJobCount > 0) {
    parts.push(`${openJobCount} open ${openJobCount === 1 ? "job" : "jobs"}`);
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
  const readiness = resolveFileLocaleReadiness(file);
  const summary = summarizeLocaleReadiness(readiness);
  return summary ?? "Needs attention";
}

function fileStatusTone(file: ProjectFileRecord): Tone {
  const readiness = resolveFileLocaleReadiness(file);
  const hasMissing = Object.values(readiness).some(
    (value) => value === "missing" || value === "stale" || value === "changed",
  );
  if (hasMissing) {
    return "watch";
  }
  return "info";
}

function countReadyToPullFiles(files: readonly ProjectFileRecord[], targetLocaleCount: number) {
  if (targetLocaleCount === 0) {
    return 0;
  }

  return files.filter((file) => {
    const readiness = resolveFileLocaleReadiness(file);
    return countReadyLocales(readiness) > 0;
  }).length;
}

export type ProjectOverviewPageContentViewProps = {
  organizationSlug: string;
  projectId: string;
  project: ProjectListRow | null;
  isProjectLoading: boolean;
  isProjectError: boolean;
  openJobCount: number;
  isOpenJobCountLoading: boolean;
  isOpenJobCountError: boolean;
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
  openJobCount,
  isOpenJobCountLoading,
  isOpenJobCountError,
  jobs,
  isJobsLoading,
  isJobsError,
  files,
  isFilesLoading,
  isFilesError,
}: ProjectOverviewPageContentViewProps) {
  const filesNeedingAttention = countFilesNeedingAttention(files);
  const pendingCount = project ? computeProjectPendingActionCount({ openJobCount }, files) : 0;
  const ongoingJobs = selectOngoingJobs(jobs);
  const attentionFiles = selectFilesNeedingAttention(files);
  const ongoingCount = ongoingJobs.length + attentionFiles.length;
  const readyToPullCount = project ? countReadyToPullFiles(files, project.targetLocales.length) : 0;

  const heroCopy = project
    ? buildHeroCopy(filesNeedingAttention, pendingCount, openJobCount)
    : null;

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
          label: "Open jobs",
          value: isOpenJobCountLoading
            ? "…"
            : isOpenJobCountError
              ? "Unavailable"
              : String(openJobCount),
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

      {project && project.source === "native" && readyToPullCount > 0 ? (
        <Card className="rounded-2xl border border-foreground/8 bg-foreground/2.5 py-0 ring-0">
          <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <TypographyP className="text-sm font-medium text-foreground">
                Ready to pull
              </TypographyP>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                {readyToPullCount} {readyToPullCount === 1 ? "file has" : "files have"} completed
                translations you can download or sync with{" "}
                <span className="font-mono text-foreground/80">sync pull</span>.
              </TypographyP>
            </div>
            <Button
              nativeButton={false}
              render={<Link href={buildProjectPath(organizationSlug, projectId, "files")} />}
              variant="outline"
              size="sm"
              className="w-fit rounded-full"
            >
              <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />
              Open files
            </Button>
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
  const isLiveTmsProject = Boolean(parseProviderProjectId(projectId));
  const openJobCountQuery = useProjectOpenJobCountQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
  });
  const jobsQuery = useProjectOverviewJobsQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
  });

  const filesQuery = useQuery({
    queryKey: ["project-overview-files", organizationSlug, projectId],
    enabled: projectQuery.isSuccess && !isLiveTmsProject,
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
      const { files } = await parseApiJsonResponse(
        response,
        projectFilesResponseSchema,
        "Invalid project files response",
      );
      return files;
    },
  });

  return (
    <ProjectOverviewPageContentView
      organizationSlug={organizationSlug}
      projectId={projectId}
      project={projectQuery.data ?? null}
      isProjectLoading={projectQuery.isLoading}
      isProjectError={projectQuery.isError}
      openJobCount={openJobCountQuery.data ?? 0}
      isOpenJobCountLoading={openJobCountQuery.isLoading}
      isOpenJobCountError={openJobCountQuery.isError}
      jobs={jobsQuery.data ?? []}
      isJobsLoading={jobsQuery.isLoading}
      isJobsError={jobsQuery.isError}
      files={filesQuery.data ?? []}
      isFilesLoading={filesQuery.isLoading}
      isFilesError={filesQuery.isError}
    />
  );
}
