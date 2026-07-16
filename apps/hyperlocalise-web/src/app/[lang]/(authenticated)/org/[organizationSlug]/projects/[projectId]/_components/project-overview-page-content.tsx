"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Add01Icon, File01Icon, LanguageCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { parseApiJsonResponse, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { supportsCatAllFilesProvider } from "@/lib/projects/cat-all-files";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
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
import { CreateJobDialog } from "../../../jobs/_components/create-job-dialog";
import { getJobStatusMessage } from "../../../jobs/_components/jobs-page-view.messages";
import { getJobName, jobTone, type ApiJob } from "../../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../_components/project-list";
import { projectOverviewPageContentMessages as messages } from "./project-overview-page-content.messages";
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

function buildHeroCopy(
  intl: IntlShape,
  filesNeedingAttention: number,
  pendingCount: number,
  openJobCount: number,
) {
  if (pendingCount === 0) {
    return {
      title: intl.formatMessage(messages.caughtUpHeroTitle),
      description: intl.formatMessage(messages.caughtUpHeroDescription),
      ctaLabel: intl.formatMessage(messages.browseFilesCta),
      ctaHref: "files",
    };
  }

  const parts: string[] = [];
  if (openJobCount > 0) {
    parts.push(intl.formatMessage(messages.openJobsDetail, { count: openJobCount }));
  }
  if (filesNeedingAttention > 0) {
    parts.push(
      intl.formatMessage(messages.filesNeedingAttentionDetail, {
        count: filesNeedingAttention,
      }),
    );
  }

  return {
    title: intl.formatMessage(messages.attentionHeroTitle),
    description: intl.formatMessage(messages.attentionHeroDescription, {
      details: parts.join(", "),
    }),
    ctaLabel: intl.formatMessage(messages.pickUpWhereYouLeftOffCta),
    ctaHref: "jobs",
  };
}

function formatJobStatusLine(intl: IntlShape, job: ApiJob) {
  return intl.formatMessage(messages.jobStatusUpdated, {
    status: intl.formatMessage(getJobStatusMessage(job.status)),
    updated: formatRelativeTimestamp(job.updatedAt),
  });
}

function formatFileStatusLine(intl: IntlShape, file: ProjectFileRecord) {
  const readiness = resolveFileLocaleReadiness(file);
  const summary = summarizeLocaleReadiness(readiness);
  return summary ?? intl.formatMessage(messages.needsAttention);
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
  onCreateJob?: () => void;
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
  onCreateJob,
}: ProjectOverviewPageContentViewProps) {
  const intl = useIntl();
  const filesNeedingAttention = countFilesNeedingAttention(files);
  const pendingCount = project ? computeProjectPendingActionCount({ openJobCount }, files) : 0;
  const ongoingJobs = selectOngoingJobs(jobs);
  const attentionFiles = selectFilesNeedingAttention(files);
  const ongoingCount = ongoingJobs.length + attentionFiles.length;
  const readyToPullCount = project ? countReadyToPullFiles(files, project.targetLocales.length) : 0;
  const showViewStrings = supportsCatAllFilesProvider(
    parseProviderProjectId(projectId)?.providerKind,
  );

  const heroCopy = project
    ? buildHeroCopy(intl, filesNeedingAttention, pendingCount, openJobCount)
    : null;

  const projectDescription =
    project?.descriptionValue ||
    project?.translationContextValue ||
    intl.formatMessage(messages.defaultProjectDescription);

  const snapshotRows = project
    ? [
        {
          label: intl.formatMessage(messages.snapshotLocales),
          value: formatLocaleRoute(project.sourceLocale, project.targetLocales),
        },
        {
          label: intl.formatMessage(messages.snapshotSource),
          value:
            project.source === "external_tms" && project.externalProviderKind
              ? providerLabel(project.externalProviderKind)
              : intl.formatMessage(messages.nativeProjectSource),
        },
        {
          label: intl.formatMessage(messages.snapshotOpenJobs),
          value: isOpenJobCountLoading
            ? "…"
            : isOpenJobCountError
              ? intl.formatMessage(messages.openJobsUnavailable)
              : String(openJobCount),
        },
      ]
    : [];

  const showHeaderActions = Boolean(project) && !isProjectLoading && !isProjectError;

  return (
    <ProjectPageShell className="gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {isProjectLoading ? (
            <>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </>
          ) : isProjectError ? (
            <>
              <TypographyH1 className="font-sans text-2xl font-medium text-foreground">
                <FormattedMessage {...messages.projectOverviewFallbackTitle} />
              </TypographyH1>
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.loadProjectError} />
              </TypographyP>
            </>
          ) : (
            <>
              <TypographyH1 className="font-sans text-2xl font-medium text-foreground">
                {project?.name ?? intl.formatMessage(messages.projectFallbackName)}
              </TypographyH1>
              <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {projectDescription}
              </TypographyP>
            </>
          )}
        </div>

        {showHeaderActions ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {showViewStrings ? (
              <Button
                nativeButton={false}
                render={<Link href={buildProjectPath(organizationSlug, projectId, "strings")} />}
                size="sm"
                variant="outline"
              >
                <HugeiconsIcon icon={LanguageCircleIcon} strokeWidth={1.8} />
                <FormattedMessage {...messages.viewStrings} />
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={onCreateJob}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.createJob} />
            </Button>
          </div>
        ) : null}
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
              title={intl.formatMessage(messages.snapshotTitle)}
              rows={snapshotRows}
              ctaLabel={intl.formatMessage(messages.viewSettings)}
              ctaHref={buildProjectPath(organizationSlug, projectId, "settings")}
            />
          </>
        ) : null}
      </section>

      <section className="space-y-4">
        <OverviewSectionHeader
          title={intl.formatMessage(messages.ongoingSection)}
          count={ongoingCount}
        />

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
                    category={intl.formatMessage(messages.categoryJob)}
                    title={getJobName(job)}
                    statusLine={formatJobStatusLine(intl, job)}
                    statusTone={jobTone(job.status)}
                    viewHref={buildProjectJobHref(organizationSlug, projectId, job.id)}
                  />
                ))
              ) : (
                <Card className="rounded-2xl border border-dashed border-border bg-muted py-0 ring-0">
                  <CardContent className="flex h-full flex-col justify-between gap-4 px-5 py-5">
                    <div>
                      <TypographyP className="text-sm font-medium text-foreground">
                        {isJobsError ? (
                          <FormattedMessage {...messages.jobsUnavailable} />
                        ) : (
                          <FormattedMessage {...messages.noActiveJobs} />
                        )}
                      </TypographyP>
                      <TypographyP className="mt-1 text-sm text-muted-foreground">
                        {isJobsError ? (
                          <FormattedMessage {...messages.jobsUnavailableDescription} />
                        ) : (
                          <FormattedMessage {...messages.noActiveJobsDescription} />
                        )}
                      </TypographyP>
                    </div>
                    <Button
                      nativeButton={false}
                      render={<Link href={buildProjectPath(organizationSlug, projectId, "jobs")} />}
                      variant="outline"
                      size="sm"
                      className="w-fit rounded-full"
                    >
                      <FormattedMessage {...messages.viewJobs} />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {attentionFiles.length > 0 ? (
                attentionFiles.map((file) => (
                  <OverviewActionCard
                    key={file.sourcePath}
                    category={intl.formatMessage(messages.categoryFile)}
                    title={file.filename}
                    statusLine={formatFileStatusLine(intl, file)}
                    statusTone={fileStatusTone(file)}
                    viewHref={buildProjectFileHref(organizationSlug, projectId, file.sourcePath)}
                  />
                ))
              ) : (
                <Card className="rounded-2xl border border-dashed border-border bg-muted py-0 ring-0">
                  <CardContent className="flex h-full flex-col justify-between gap-4 px-5 py-5">
                    <div>
                      <TypographyP className="text-sm font-medium text-foreground">
                        {isFilesError ? (
                          <FormattedMessage {...messages.filesUnavailable} />
                        ) : (
                          <FormattedMessage {...messages.noFilesNeedAttention} />
                        )}
                      </TypographyP>
                      <TypographyP className="mt-1 text-sm text-muted-foreground">
                        {isFilesError ? (
                          <FormattedMessage {...messages.filesUnavailableDescription} />
                        ) : (
                          <FormattedMessage {...messages.noFilesNeedAttentionDescription} />
                        )}
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
                      <FormattedMessage {...messages.viewFiles} />
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </section>

      {project && project.source === "native" && readyToPullCount > 0 ? (
        <Card className="rounded-2xl border border-border bg-muted py-0 ring-0">
          <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <TypographyP className="text-sm font-medium text-foreground">
                <FormattedMessage {...messages.readyToPullTitle} />
              </TypographyP>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                <FormattedMessage
                  {...messages.readyToPullDescription}
                  values={{
                    count: readyToPullCount,
                    code: (chunks: ReactNode) => (
                      <span className="font-mono text-foreground">{chunks}</span>
                    ),
                  }}
                />
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
              <FormattedMessage {...messages.openFiles} />
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
  const intl = useIntl();
  const [createJobOpen, setCreateJobOpen] = useState(false);
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
        throw await readApiResponseError(
          response,
          intl.formatMessage(messages.loadProjectFilesFailed),
        );
      }
      const { files } = await parseApiJsonResponse(
        response,
        projectFilesResponseSchema,
        intl.formatMessage(messages.invalidProjectFilesResponse),
      );
      return files;
    },
  });

  const sourceLocale = projectQuery.data?.sourceLocale?.trim() || "en";
  const targetLocales = projectQuery.data?.targetLocales ?? [];

  return (
    <>
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
        onCreateJob={() => setCreateJobOpen(true)}
      />
      <CreateJobDialog
        open={createJobOpen}
        onOpenChange={setCreateJobOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        sourceLocale={sourceLocale}
        targetLocales={targetLocales}
        onCreated={async () => {
          await Promise.all([jobsQuery.refetch(), openJobCountQuery.refetch()]);
        }}
      />
    </>
  );
}
