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
import { useState, type ReactNode } from "react";
import {
  Add01Icon,
  ArrowRight01Icon,
  CubeIcon,
  LanguageCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";
import { supportsContentEditorAllFilesProvider } from "@/lib/projects/content-editor-all-files";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { CreateJobDialog } from "../../../jobs/_components/create-job-dialog";
import {
  getJobName,
  taskDetailSummary,
  type ApiJob,
} from "../../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../_components/project-list";
import { ProjectLocaleProgressList } from "./project-locale-progress-list";
import { projectOverviewPageContentMessages as messages } from "./project-overview-page-content.messages";
import { ProjectPageShell, useProjectPageQuery } from "./project-page-shell";
import { useProjectLocaleProgressQuery } from "./use-project-locale-progress";
import { useProjectOverviewJobsQuery } from "./use-project-overview-jobs";
import {
  buildProjectOverviewTriageItems,
  formatProjectLocaleRoute,
  type ProjectOverviewTriageItem,
  type ProjectOverviewTriageKind,
} from "./project-overview-view-model";

function buildProjectJobHref(organizationSlug: string, projectId: string, jobId: string) {
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

function resolveTriageJobMeta(
  job: ApiJob | undefined,
  intl: ReturnType<typeof useIntl>,
): string | null {
  if (!job) {
    return null;
  }

  const hasLocales = Boolean(job.externalTargetLocales?.length || job.reviewTargetLocale);
  const hasAssignees = Boolean(job.externalAssignedUsers?.length);
  if (!hasLocales && !hasAssignees) {
    return null;
  }

  return taskDetailSummary(job, intl);
}

function triageStatusLabel(kind: ProjectOverviewTriageKind, intl: ReturnType<typeof useIntl>) {
  switch (kind) {
    case "review":
      return intl.formatMessage(messages.statusReview);
    case "failed":
      return intl.formatMessage(messages.statusFailed);
    case "job":
      return intl.formatMessage(messages.statusRunning);
    case "guidance":
      return intl.formatMessage(messages.statusGuidance);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function triageStatusClassName(kind: ProjectOverviewTriageKind) {
  switch (kind) {
    case "review":
      return "text-amber-900";
    case "failed":
      return "text-red-800";
    case "job":
      return "text-primary";
    case "guidance":
      return "text-muted-foreground";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function resolveTriageCopy(
  item: ProjectOverviewTriageItem,
  intl: ReturnType<typeof useIntl>,
): { title: string; meta: string | null; cta: string } {
  switch (item.kind) {
    case "review":
    case "failed":
    case "job":
      return {
        title: getJobName(item.job!, intl),
        meta: resolveTriageJobMeta(item.job, intl),
        cta:
          item.kind === "review"
            ? intl.formatMessage(messages.reviewCta)
            : intl.formatMessage(messages.openJobCta),
      };
    case "guidance":
      return {
        title: intl.formatMessage(messages.triageGuidanceTitle),
        meta: intl.formatMessage(messages.triageGuidanceDescription),
        cta: intl.formatMessage(messages.addGuidanceCta),
      };
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }
}

function ProjectOverviewSectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wider text-foreground uppercase">{children}</span>
  );
}

function ProjectOverviewTriageRow({
  href,
  statusLabel,
  statusClassName,
  title,
  meta,
  cta,
}: {
  href: string;
  statusLabel: string;
  statusClassName: string;
  title: string;
  meta: string | null;
  cta: string;
}) {
  return (
    <Link href={href} className="group">
      <Box paddingY="2u">
        <Row spacing="2u" alignY="start">
          <Column width="content">
            <span
              className={`inline-block w-24 shrink-0 pt-0.5 text-xs font-medium tracking-[0.04em] uppercase ${statusClassName}`}
            >
              {statusLabel}
            </span>
          </Column>
          <Column width="fluid">
            <Rows spacing="0.5u">
              <span className="text-base font-medium text-pretty text-foreground">{title}</span>
              {meta ? (
                <span className="font-mono text-[13px] leading-[18px] text-muted-foreground">
                  {meta}
                </span>
              ) : null}
            </Rows>
          </Column>
          <Column width="content">
            <span className="inline-flex w-24 shrink-0 items-center justify-end gap-1 pt-0.5 text-sm font-medium text-foreground">
              {cta}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={1.8}
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </Column>
        </Row>
      </Box>
    </Link>
  );
}

function ProjectOverviewSidebar({
  project,
  isNative,
  hasTranslationGuidance,
  localeRoute,
  settingsHref,
}: {
  project: ProjectListRow;
  isNative: boolean;
  hasTranslationGuidance: boolean;
  localeRoute: string;
  settingsHref: string;
}) {
  return (
    <Rows spacing="4u">
      {isNative ? (
        <Rows spacing="1.5u">
          <Row spacing="1.5u" align="spaceBetween" alignY="baseline">
            <ProjectOverviewSectionLabel>
              <FormattedMessage {...messages.guidanceTitle} />
            </ProjectOverviewSectionLabel>
            <Link
              href={settingsHref}
              className="text-[13px] leading-4 font-medium text-muted-foreground hover:text-foreground"
            >
              <FormattedMessage {...messages.guidanceEdit} />
            </Link>
          </Row>
          {hasTranslationGuidance ? (
            <MarkdownPreview
              value={project.translationContextValue}
              chrome="minimal"
              className="line-clamp-4"
              contentClassName="text-sm leading-snug text-pretty text-muted-foreground"
            />
          ) : (
            <TypographyP wrapStyle="pretty" size="small" tone="subtle">
              <FormattedMessage {...messages.guidanceMissingDescription} />
            </TypographyP>
          )}
        </Rows>
      ) : null}

      <Rows spacing="1.5u">
        {isNative ? <Separator /> : null}
        <ProjectOverviewSectionLabel>
          <FormattedMessage {...messages.signalsLocales} />
        </ProjectOverviewSectionLabel>
        <span className="font-mono text-[13px] leading-5 text-foreground">
          {project.targetLocales.length > 0 ? (
            localeRoute
          ) : (
            <FormattedMessage {...messages.signalsNoLocales} />
          )}
        </span>
        {project.targetLocales.length === 0 ? (
          <Link href={settingsHref} className="text-sm font-medium text-primary hover:underline">
            <FormattedMessage {...messages.viewSettings} />
          </Link>
        ) : null}
      </Rows>

      {isNative ? (
        <Rows spacing="1u">
          <Separator />
          <ProjectOverviewSectionLabel>
            <FormattedMessage {...messages.shipTitle} />
          </ProjectOverviewSectionLabel>
          <span className="text-sm leading-tight text-foreground">
            {project.lastSyncedAt ? (
              <FormattedMessage
                {...messages.shipLastSynced}
                values={{ when: project.lastSyncedAt }}
              />
            ) : (
              <FormattedMessage {...messages.shipNeverSynced} />
            )}
          </span>
          <Link href={settingsHref} className="text-sm font-medium text-primary hover:underline">
            <FormattedMessage {...messages.shipConnectCli} />
          </Link>
        </Rows>
      ) : null}
    </Rows>
  );
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
  locales: readonly ProjectLocaleProgressRow[];
  isLocaleProgressLoading: boolean;
  isLocaleProgressError: boolean;
  onCreateJob?: () => void;
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
  locales,
  isLocaleProgressLoading,
  isLocaleProgressError,
  onCreateJob,
}: ProjectOverviewPageContentViewProps) {
  const intl = useIntl();
  const isNative = project?.source === "native";
  const hasTranslationGuidance = Boolean(project?.translationContextValue?.trim());
  const showViewStrings = supportsContentEditorAllFilesProvider(
    parseProviderProjectId(projectId)?.providerKind,
  );

  const triageItems = project
    ? buildProjectOverviewTriageItems({
        jobs,
        isNative: isNative ?? false,
        hasTranslationGuidance,
      })
    : [];

  const projectDescription =
    project?.descriptionValue || intl.formatMessage(messages.defaultProjectDescription);

  const projectsHref = `/org/${organizationSlug}/projects`;
  const settingsHref = buildProjectPath(organizationSlug, projectId, "settings");
  const filesHref = buildProjectPath(organizationSlug, projectId, "files");
  const jobsHref = buildProjectPath(organizationSlug, projectId, "jobs");
  const showHeaderActions = Boolean(project) && !isProjectLoading && !isProjectError;
  const localeRoute = project
    ? formatProjectLocaleRoute(project.sourceLocale, project.targetLocales)
    : "";
  const showSidebar = Boolean(project) && !isProjectLoading;

  return (
    <ProjectPageShell>
      <Box paddingX="2u" paddingTop="1u" paddingBottom="4u">
        <Rows spacing="3u">
          <Columns spacing="2u" collapseBelow="small" align="spaceBetween" alignY="start">
            <Column width="fluid">
              <Rows spacing="1u">
                {isProjectLoading ? (
                  <>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-full max-w-xl" />
                  </>
                ) : isProjectError ? (
                  <>
                    <TypographyH1
                      className="text-2xl text-balance tracking-tight md:text-2xl"
                      weight="medium"
                      tone="content"
                    >
                      <FormattedMessage {...messages.projectOverviewFallbackTitle} />
                    </TypographyH1>
                    <TypographyP wrapStyle="pretty" size="small" tone="subtle">
                      <FormattedMessage {...messages.loadProjectError} />
                    </TypographyP>
                  </>
                ) : (
                  <>
                    <Link
                      href={projectsHref}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <HugeiconsIcon icon={CubeIcon} strokeWidth={1.8} className="size-4" />
                      <FormattedMessage {...messages.projectsBreadcrumb} />
                    </Link>
                    <TypographyH1
                      className="text-2xl text-balance tracking-tight md:text-2xl"
                      weight="medium"
                      tone="content"
                    >
                      {project?.name ?? intl.formatMessage(messages.projectFallbackName)}
                    </TypographyH1>
                    <TypographyP
                      className="max-w-xl leading-normal"
                      wrapStyle="pretty"
                      size="small"
                      tone="subtle"
                    >
                      {projectDescription}
                    </TypographyP>
                  </>
                )}
              </Rows>
            </Column>

            {showHeaderActions ? (
              <Column width="content">
                <Row spacing="1u" alignY="center">
                  {showViewStrings ? (
                    <Button
                      nativeButton={false}
                      render={
                        <Link href={buildProjectPath(organizationSlug, projectId, "strings")} />
                      }
                      size="sm"
                      variant="outline"
                    >
                      <HugeiconsIcon icon={LanguageCircleIcon} strokeWidth={1.8} />
                      <FormattedMessage {...messages.openEditor} />
                    </Button>
                  ) : null}
                  <Button
                    nativeButton={false}
                    render={<Link href={filesHref} />}
                    size="sm"
                    variant="outline"
                  >
                    <FormattedMessage {...messages.viewFiles} />
                  </Button>
                  <Button type="button" size="sm" onClick={onCreateJob}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                    <FormattedMessage {...messages.createJob} />
                  </Button>
                </Row>
              </Column>
            ) : null}
          </Columns>

          {isProjectLoading ? (
            <Skeleton className="min-h-56 w-full" />
          ) : project ? (
            <Rows spacing="4u">
              <ProjectLocaleProgressList
                locales={locales}
                isLoading={isLocaleProgressLoading}
                isError={isLocaleProgressError}
                settingsHref={settingsHref}
                stringsHref={
                  showViewStrings ? buildProjectPath(organizationSlug, projectId, "strings") : null
                }
              />
              <Box paddingTop="1u">
                <Columns spacing="4u" collapseBelow="large" alignY="start">
                  <Column width="fluid">
                    <Rows spacing="0">
                      <Box paddingBottom="1.5u">
                        <Row spacing="0" align="spaceBetween" alignY="baseline">
                          <ProjectOverviewSectionLabel>
                            <FormattedMessage {...messages.todayTitle} />
                          </ProjectOverviewSectionLabel>
                          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase tabular-nums">
                            {triageItems.length}
                          </span>
                        </Row>
                      </Box>
                      <Separator className="bg-foreground" />

                      {isJobsLoading ? (
                        <Box paddingTop="3u">
                          <Skeleton className="h-24 w-full" />
                        </Box>
                      ) : triageItems.length > 0 ? (
                        <>
                          {triageItems.map((item) => {
                            const copy = resolveTriageCopy(item, intl);
                            const href =
                              item.kind === "guidance"
                                ? settingsHref
                                : item.job
                                  ? buildProjectJobHref(organizationSlug, projectId, item.job.id)
                                  : jobsHref;

                            return (
                              <div key={item.id}>
                                <ProjectOverviewTriageRow
                                  href={href}
                                  statusLabel={triageStatusLabel(item.kind, intl)}
                                  statusClassName={triageStatusClassName(item.kind)}
                                  title={copy.title}
                                  meta={copy.meta}
                                  cta={copy.cta}
                                />
                                <Separator />
                              </div>
                            );
                          })}
                          <Box paddingTop="2u">
                            <Link
                              href={jobsHref}
                              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <FormattedMessage {...messages.viewAllJobs} />
                              <HugeiconsIcon
                                icon={ArrowRight01Icon}
                                strokeWidth={1.8}
                                className="size-4"
                              />
                            </Link>
                          </Box>
                        </>
                      ) : isJobsError ? (
                        <Box paddingTop="3u">
                          <Rows spacing="1u">
                            <TypographyP weight="medium" tone="content">
                              <FormattedMessage {...messages.jobsUnavailable} />
                            </TypographyP>
                            <TypographyP wrapStyle="pretty" size="small" tone="subtle">
                              <FormattedMessage {...messages.jobsUnavailableDescription} />
                            </TypographyP>
                            <Button
                              nativeButton={false}
                              render={<Link href={jobsHref} />}
                              variant="outline"
                              size="sm"
                            >
                              <FormattedMessage {...messages.viewJobs} />
                            </Button>
                          </Rows>
                        </Box>
                      ) : (
                        <Box paddingTop="3u" paddingBottom="1u">
                          <Rows spacing="1u">
                            <TypographyP weight="medium" tone="content">
                              <FormattedMessage {...messages.triageEmptyTitle} />
                            </TypographyP>
                            <TypographyP
                              className="max-w-md leading-snug"
                              wrapStyle="pretty"
                              size="small"
                              tone="subtle"
                            >
                              <FormattedMessage {...messages.triageEmptyDescription} />
                            </TypographyP>
                          </Rows>
                        </Box>
                      )}
                    </Rows>
                  </Column>

                  {showSidebar ? (
                    <>
                      <Column width="content">
                        <div className="hidden self-stretch lg:block">
                          <Separator orientation="vertical" />
                        </div>
                      </Column>
                      <Column width="1/4">
                        <Box paddingTop="0.5u">
                          <ProjectOverviewSidebar
                            project={project}
                            isNative={isNative ?? false}
                            hasTranslationGuidance={hasTranslationGuidance}
                            localeRoute={localeRoute}
                            settingsHref={settingsHref}
                          />
                        </Box>
                      </Column>
                    </>
                  ) : null}
                </Columns>
              </Box>
            </Rows>
          ) : null}
        </Rows>
      </Box>
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
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const jobsQuery = useProjectOverviewJobsQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
  });
  const localeProgressQuery = useProjectLocaleProgressQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
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
        jobs={jobsQuery.data ?? []}
        isJobsLoading={jobsQuery.isLoading}
        isJobsError={jobsQuery.isError}
        locales={localeProgressQuery.data ?? []}
        isLocaleProgressLoading={localeProgressQuery.isLoading}
        isLocaleProgressError={localeProgressQuery.isError}
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
          await jobsQuery.refetch();
        }}
      />
    </>
  );
}
