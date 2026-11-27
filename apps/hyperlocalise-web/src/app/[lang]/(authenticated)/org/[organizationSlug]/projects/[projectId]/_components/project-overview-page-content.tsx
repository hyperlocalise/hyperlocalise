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
import { PlusIcon, ArrowRightIcon, CaretRightIcon, TranslateIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { AiFeatureAction } from "@/components/billing/ai-feature-action";
import { MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { QaAttentionCard } from "@/components/qa/qa-attention-card";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { supportsContentEditorAllFilesProvider } from "@/lib/projects/content-editor-all-files";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { CreateJobDialog } from "../../../jobs/_components/create-job-dialog";
import {
  getJobName,
  getJobTargetLocaleIds,
  type ApiJob,
} from "../../../jobs/_components/jobs-page-view";
import { formatRelativeTimestamp } from "../../../_components/workspace-files-shared";
import type { ProjectListRow } from "../../_components/project-list";
import { ProjectLocaleProgressList } from "./project-locale-progress-list";
import { projectOverviewPageContentMessages as messages } from "./project-overview-page-content.messages";
import { ProjectPageShell, useProjectPageQuery } from "./project-page-shell";
import { useProjectLocaleProgressQuery } from "@/lib/projects/use-project-locale-progress";
import { TranslateLocaleWithAgentDialog } from "./translate-locale-with-agent-dialog";
import { useProjectOverviewJobsQuery } from "./use-project-overview-jobs";
import {
  buildProjectOverviewJobItems,
  formatProjectLocaleRoute,
  PROJECT_OVERVIEW_INLINE_LOCALES,
  stripTrailingJobTimestamp,
  type ProjectOverviewJobItem,
  type ProjectOverviewJobKind,
} from "./project-overview-view-model";

function buildProjectJobHref(organizationSlug: string, projectId: string, jobId: string) {
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

/** "fr-FR, ja-JP" for a few locales, "10 locales" past that; the full list goes in the tooltip. */
function resolveJobLocaleSummary(
  job: ApiJob | undefined,
  intl: ReturnType<typeof useIntl>,
): { label: string; full: string } | null {
  if (!job) return null;
  const locales = getJobTargetLocaleIds(job);
  if (locales.length === 0) return null;
  const full = locales.join(", ");
  const label =
    locales.length <= PROJECT_OVERVIEW_INLINE_LOCALES
      ? full
      : intl.formatMessage(messages.localeCount, { count: locales.length });
  return { label, full };
}

function jobStatusLabel(kind: ProjectOverviewJobKind, intl: ReturnType<typeof useIntl>) {
  switch (kind) {
    case "review":
      return intl.formatMessage(messages.statusReview);
    case "failed":
      return intl.formatMessage(messages.statusFailed);
    case "running":
      return intl.formatMessage(messages.statusRunning);
    case "queued":
      return intl.formatMessage(messages.statusQueued);
    case "succeeded":
      return intl.formatMessage(messages.statusSucceeded);
    case "cancelled":
      return intl.formatMessage(messages.statusCancelled);
    case "guidance":
      return intl.formatMessage(messages.statusGuidance);
    default:
      return assertNever(kind);
  }
}

/** The dot carries the status; a ring means nothing has happened yet. */
function jobStatusDotClassName(kind: ProjectOverviewJobKind) {
  switch (kind) {
    case "review":
      return "bg-amber-500";
    case "failed":
      return "bg-red-500";
    case "running":
      return "bg-primary animate-pulse";
    case "queued":
      return "border-[1.5px] border-primary";
    case "succeeded":
      return "bg-emerald-500";
    case "cancelled":
      return "bg-muted-foreground/40";
    case "guidance":
      return "border-[1.5px] border-dashed border-muted-foreground";
    default:
      return assertNever(kind);
  }
}

/** Only rows someone has to act on spell their status out. */
function jobStatusCalloutClassName(kind: ProjectOverviewJobKind): string | null {
  switch (kind) {
    case "review":
      return "text-amber-700 dark:text-amber-400";
    case "failed":
      return "text-red-700 dark:text-red-400";
    case "running":
    case "queued":
    case "succeeded":
    case "cancelled":
    case "guidance":
      return null;
    default:
      return assertNever(kind);
  }
}

type JobRowCopy = {
  title: string;
  fullTitle: string;
  locales: { label: string; full: string } | null;
  trailing: string | null;
  trailingTitle: string | null;
  cta: string | null;
};

function resolveJobRowCopy(
  item: ProjectOverviewJobItem,
  intl: ReturnType<typeof useIntl>,
): JobRowCopy {
  switch (item.kind) {
    case "review":
    case "failed":
    case "running":
    case "queued":
    case "succeeded":
    case "cancelled": {
      const job = item.job!;
      const fullTitle = getJobName(job, intl);
      return {
        title: stripTrailingJobTimestamp(fullTitle),
        fullTitle,
        locales: resolveJobLocaleSummary(job, intl),
        trailing: job.updatedAt ? formatRelativeTimestamp(job.updatedAt) : null,
        trailingTitle: job.updatedAt
          ? intl.formatDate(job.updatedAt, { dateStyle: "medium", timeStyle: "short" })
          : null,
        cta: item.kind === "review" ? intl.formatMessage(messages.reviewCta) : null,
      };
    }
    case "guidance": {
      const title = intl.formatMessage(messages.triageGuidanceTitle);
      return {
        title,
        fullTitle: `${title} — ${intl.formatMessage(messages.triageGuidanceDescription)}`,
        locales: null,
        trailing: null,
        trailingTitle: null,
        cta: intl.formatMessage(messages.addGuidanceCta),
      };
    }
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
  kind,
  statusLabel,
  copy,
}: {
  href: string;
  kind: ProjectOverviewJobKind;
  statusLabel: string;
  copy: JobRowCopy;
}) {
  const calloutClassName = jobStatusCalloutClassName(kind);
  return (
    <Link
      href={href}
      className="group -mx-2 flex h-9 min-w-0 items-center gap-3 rounded-md px-2 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <span
        role="img"
        aria-label={statusLabel}
        title={statusLabel}
        className={`size-2 shrink-0 rounded-full ${jobStatusDotClassName(kind)}`}
      />
      <span className="min-w-0 flex-1 truncate text-foreground" title={copy.fullTitle}>
        {copy.title}
      </span>
      {calloutClassName && !copy.cta ? (
        <span className={`shrink-0 text-xs font-medium ${calloutClassName}`} aria-hidden>
          {statusLabel}
        </span>
      ) : null}
      {copy.locales ? (
        <span
          className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:inline"
          title={copy.locales.full}
        >
          {copy.locales.label}
        </span>
      ) : null}
      {copy.cta ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
          {copy.cta}
          <CaretRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      ) : null}
      {copy.trailing ? (
        <span
          className="min-w-24 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          title={copy.trailingTitle ?? undefined}
        >
          {copy.trailing}
        </span>
      ) : null}
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
  qaAttentionCard?: ReactNode;
  renderLocaleAgentAction?: (row: ProjectLocaleProgressRow) => ReactNode;
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
  qaAttentionCard,
  renderLocaleAgentAction,
}: ProjectOverviewPageContentViewProps) {
  const intl = useIntl();
  const isNative = project?.source === "native";
  const hasTranslationGuidance = Boolean(project?.translationContextValue?.trim());
  const showViewStrings = supportsContentEditorAllFilesProvider(
    parseProviderProjectId(projectId)?.providerKind,
  );

  const recentJobItems = project
    ? buildProjectOverviewJobItems({
        jobs,
        isNative: isNative ?? false,
        hasTranslationGuidance,
      })
    : [];

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <h1 className="sr-only">
              {isProjectError
                ? intl.formatMessage(messages.projectOverviewFallbackTitle)
                : (project?.name ?? intl.formatMessage(messages.projectFallbackName))}
            </h1>
            {isProjectLoading ? <Skeleton className="h-9 w-40 shrink-0" /> : null}
            {isProjectError ? (
              <TypographyP wrapStyle="pretty" size="small" tone="subtle">
                <FormattedMessage {...messages.loadProjectError} />
              </TypographyP>
            ) : null}
            {showHeaderActions ? (
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
                    <TranslateIcon />
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
                  <PlusIcon />
                  <FormattedMessage {...messages.createJob} />
                </Button>
              </Row>
            ) : null}
          </div>

          {isProjectLoading ? (
            <Skeleton className="min-h-56 w-full" />
          ) : project ? (
            <Rows spacing="4u">
              {qaAttentionCard}
              <ProjectLocaleProgressList
                locales={locales}
                expectedLocaleCount={project.targetLocales.length}
                isLoading={isLocaleProgressLoading}
                isError={isLocaleProgressError}
                settingsHref={settingsHref}
                stringsHref={
                  showViewStrings ? buildProjectPath(organizationSlug, projectId, "strings") : null
                }
                renderAgentAction={renderLocaleAgentAction}
              />
              <Box paddingTop="1u">
                <Columns spacing="4u" collapseBelow="large" alignY="start">
                  <Column width="fluid">
                    <Rows spacing="0">
                      <Box paddingBottom="1.5u">
                        <Row spacing="0" align="spaceBetween" alignY="baseline">
                          <ProjectOverviewSectionLabel>
                            <FormattedMessage {...messages.recentJobsTitle} />
                          </ProjectOverviewSectionLabel>
                          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase tabular-nums">
                            {recentJobItems.length}
                          </span>
                        </Row>
                      </Box>
                      <Separator />

                      {isJobsLoading ? (
                        <Box paddingTop="3u">
                          <Skeleton className="h-24 w-full" />
                        </Box>
                      ) : recentJobItems.length > 0 ? (
                        <>
                          <ul className="py-1">
                            {recentJobItems.map((item) => {
                              const copy = resolveJobRowCopy(item, intl);
                              const href =
                                item.kind === "guidance"
                                  ? settingsHref
                                  : item.job
                                    ? buildProjectJobHref(organizationSlug, projectId, item.job.id)
                                    : jobsHref;

                              return (
                                <li key={item.id}>
                                  <ProjectOverviewTriageRow
                                    href={href}
                                    kind={item.kind}
                                    statusLabel={jobStatusLabel(item.kind, intl)}
                                    copy={copy}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                          <Box paddingTop="1u">
                            <Link
                              href={jobsHref}
                              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <FormattedMessage {...messages.viewAllJobs} />
                              <ArrowRightIcon className="size-4" />
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
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentLocale, setAgentLocale] = useState<string | null>(null);
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const jobsQuery = useProjectOverviewJobsQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
  });
  const localeProgressQuery = useProjectLocaleProgressQuery(organizationSlug, projectId, {
    enabled: projectQuery.isSuccess,
  });

  const sourceLocale = projectQuery.data?.sourceLocale?.trim() || "en";
  const targetLocales = projectQuery.data?.targetLocales ?? [];
  const isNative = projectQuery.data?.source === "native";

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
        qaAttentionCard={
          isNative ? (
            <QaAttentionCard organizationSlug={organizationSlug} projectId={projectId} />
          ) : null
        }
        renderLocaleAgentAction={
          isNative
            ? (row) => (
                <AiFeatureAction organizationSlug={organizationSlug} size="sm">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setAgentLocale(row.locale);
                      setAgentDialogOpen(true);
                    }}
                  >
                    <TranslateIcon />
                    <FormattedMessage {...messages.translateLocaleWithAgent} />
                  </Button>
                </AiFeatureAction>
              )
            : undefined
        }
      />
      <TranslateLocaleWithAgentDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        sourceLocale={sourceLocale}
        locale={agentLocale}
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
