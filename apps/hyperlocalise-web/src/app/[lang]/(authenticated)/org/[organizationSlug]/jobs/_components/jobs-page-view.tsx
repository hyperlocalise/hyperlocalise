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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  KanbanIcon,
  ListViewIcon,
  CenterFocusIcon,
  TranslateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { nativeJobSourceFileDisplayLabel } from "@/lib/projects/jobs/native-job-source-file-display";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import { JobsGroupedList } from "./jobs-grouped-list";
import { JobsKanbanBoard } from "./jobs-kanban-board";
import { JobsListToolbar } from "./jobs-list-toolbar";
import {
  buildJobDetailHref,
  readJobsViewMode,
  writeJobsViewMode,
  type JobsViewMode,
} from "./jobs-view-helpers";
import { jobsPageViewMessages } from "./jobs-page-view.messages";
import { formatLocaleList, getCrowdinTargetLocales } from "./provider-crowdin-job-display";

import {
  PageHeader,
  WorkspacePageShell,
  type Tone,
} from "../../_components/workspace-resource-shared";
import {
  ProjectPageShell,
  ProjectSectionHeader,
} from "../../projects/[projectId]/_components/project-page-shell";

export type JobsScope = "all" | "personal";

export type ApiJob = {
  id: string;
  projectId: string | null;
  createdByUserId: string | null;
  assigneeType?: "user" | "agent" | null;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  assetType: string | null;
  assetOperation: string | null;
  externalProviderKind: string | null;
  externalJobId?: string | null;
  externalTaskId: string | null;
  externalStatus: string | null;
  externalTitle: string | null;
  externalDueDate: string | null;
  externalTargetLocales: string[] | null;
  externalAssignedUsers: string[] | null;
  externalSyncState: string | null;
  sourceFilename?: string | null;
  sourcePath?: string | null;
};

export type JobRow = ApiJob & {
  projectName: string | null;
};

export const jobsStatusOptions = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_for_review",
  "cancelled",
] as const;

export type JobsStatusFilter = (typeof jobsStatusOptions)[number];

type JobLinkKind = "title" | "details" | "content-editor";

export type JobsLinkRenderer = (props: {
  href: string;
  kind: JobLinkKind;
  children: ReactNode;
}) => ReactNode;

export type JobsErrorRenderer = (props: { error: unknown; organizationSlug: string }) => ReactNode;

const jobStatusLabels = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  waiting_for_review: "Waiting for review",
  cancelled: "Cancelled",
} as const satisfies Record<ApiJob["status"], string>;

export function formatJobStatusLabel(status: ApiJob["status"]) {
  return jobStatusLabels[status];
}

export function jobTone(status: ApiJob["status"]): Tone {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
    case "waiting_for_review":
      return "watch";
    default:
      return "info";
  }
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelativeTime(value: string | null, now = Date.now()) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaSeconds = Math.round((date.getTime() - now) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 60) return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second");
  if (absoluteSeconds < 3_600)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  if (absoluteSeconds < 86_400)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 86_400), "day");
  if (absoluteSeconds < 31_536_000)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 2_592_000), "month");
  return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 31_536_000), "year");
}

export function sourceLabel(job: ApiJob) {
  return getTmsProviderBranding(job.externalProviderKind).name;
}

export function JobSourceLabel({ job, compact = false }: { job: ApiJob; compact?: boolean }) {
  const { name } = getTmsProviderBranding(job.externalProviderKind);

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <TmsProviderBrandMark providerKind={job.externalProviderKind} compact={compact} />
      <span className={cn("truncate font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
        {name}
      </span>
    </span>
  );
}

function targetLocales(job: ApiJob) {
  if (job.externalTargetLocales?.length) return job.externalTargetLocales.join(", ");
  if (job.reviewTargetLocale) return job.reviewTargetLocale;
  const nativeTargetLocales = getInputPayloadStringArray(job, "targetLocales");
  if (nativeTargetLocales.length > 0) return nativeTargetLocales.join(", ");
  return "—";
}

function assignees(job: ApiJob, intl?: IntlShape) {
  if (job.externalAssignedUsers?.length) return job.externalAssignedUsers.join(", ");
  if (job.assigneeType === "agent") {
    return intl ? intl.formatMessage(jobsPageViewMessages.assigneeAgent) : "Agent";
  }
  return "—";
}

function formatJobName(value: string) {
  return value.slice(0, 72);
}

function getInputPayloadString(job: ApiJob, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }
  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getInputPayloadStringArray(job: ApiJob, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return [];
  }
  const value = (job.inputPayload as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export function getJobName(job: ApiJob, intl?: IntlShape) {
  if (job.externalTitle) return formatJobName(job.externalTitle);
  const metadataTitle =
    typeof job.inputPayload === "object" &&
    job.inputPayload &&
    "metadata" in job.inputPayload &&
    typeof (job.inputPayload as { metadata?: unknown }).metadata === "object" &&
    (job.inputPayload as { metadata?: { title?: unknown } }).metadata &&
    typeof (job.inputPayload as { metadata: { title?: unknown } }).metadata.title === "string"
      ? (job.inputPayload as { metadata: { title: string } }).metadata.title
      : null;
  if (metadataTitle) return formatJobName(metadataTitle);
  if (job.kind === "review" && job.reviewCriteria) {
    return formatJobName(
      intl
        ? intl.formatMessage(jobsPageViewMessages.reviewJobName, { criteria: job.reviewCriteria })
        : `Review: ${job.reviewCriteria}`,
    );
  }
  if (job.kind === "sync" && job.syncConnectorKind) {
    const direction =
      job.syncDirection ??
      (intl ? intl.formatMessage(jobsPageViewMessages.syncDirectionFallback) : "sync");
    return formatJobName(
      intl
        ? intl.formatMessage(jobsPageViewMessages.syncJobName, {
            direction,
            connector: job.syncConnectorKind,
          })
        : `${direction} ${job.syncConnectorKind}`,
    );
  }
  if (job.kind === "asset_management" && job.assetType) {
    const operation =
      job.assetOperation ??
      (intl ? intl.formatMessage(jobsPageViewMessages.assetOperationFallback) : "manage");
    return formatJobName(
      intl
        ? intl.formatMessage(jobsPageViewMessages.assetJobName, {
            operation,
            assetType: job.assetType,
          })
        : `${operation} ${job.assetType}`,
    );
  }
  const researchScope = getInputPayloadString(job, "scope");
  if (job.kind === "research" && researchScope) {
    return formatJobName(
      intl
        ? intl.formatMessage(jobsPageViewMessages.researchJobName, { scope: researchScope })
        : `Research: ${researchScope}`,
    );
  }
  const sourceText = getInputPayloadString(job, "sourceText");
  if (sourceText) return formatJobName(sourceText);
  const sourceFileLabel = nativeJobSourceFileDisplayLabel({
    inputPayload: job.inputPayload,
    sourceFilename: job.sourceFilename,
    sourcePath: job.sourcePath,
  });
  if (sourceFileLabel) return formatJobName(sourceFileLabel);
  return job.id;
}

const jobKindMessages = {
  translation: jobsPageViewMessages.kindTranslation,
  research: jobsPageViewMessages.kindResearch,
  review: jobsPageViewMessages.kindReview,
  proofread: jobsPageViewMessages.kindProofread,
  sync: jobsPageViewMessages.kindSync,
  asset_management: jobsPageViewMessages.kindAssetManagement,
} as const;

export function formatJobKind(job: ApiJob, intl?: IntlShape) {
  if (intl) {
    if (job.kind === "translation" && job.type) {
      return intl.formatMessage(jobsPageViewMessages.kindTranslationWithType, { type: job.type });
    }
    return intl.formatMessage(jobKindMessages[job.kind]);
  }
  if (job.kind === "translation" && job.type) return `${job.kind.replace("_", " ")} · ${job.type}`;
  return job.kind.replace("_", " ");
}

function jobMatchesFilters(job: JobRow, input: { search: string; statusFilter: JobsStatusFilter }) {
  const matchesStatus = input.statusFilter === "all" || job.status === input.statusFilter;
  const matchesSearch =
    !input.search ||
    [
      getJobName(job),
      job.projectName,
      job.id,
      job.kind,
      job.externalProviderKind,
      job.externalStatus,
      targetLocales(job),
      assignees(job),
    ]
      .join(" ")
      .toLowerCase()
      .includes(input.search);
  return matchesStatus && matchesSearch;
}

export function taskDetailSummary(job: ApiJob, intl?: IntlShape) {
  const fallbackTargetLocales = job.externalTargetLocales?.length
    ? job.externalTargetLocales
    : job.reviewTargetLocale
      ? [job.reviewTargetLocale]
      : getInputPayloadStringArray(job, "targetLocales");
  const locales = formatLocaleList(getCrowdinTargetLocales(null, fallbackTargetLocales));
  const people = assignees(job, intl);
  if (locales === "—" && people === "—") {
    return intl
      ? intl.formatMessage(jobsPageViewMessages.noLocalesOrAssignees)
      : "No locales or assignees";
  }
  if (locales === "—") return people;
  if (people === "—") return locales;
  return `${locales} · ${people}`;
}

function defaultRenderJobLink({ href, kind, children }: Parameters<JobsLinkRenderer>[0]) {
  if (kind === "title") {
    return (
      <Button
        nativeButton={false}
        render={<a href={href} />}
        variant="ghost"
        className="-mx-2 h-auto min-w-0 justify-start px-2 py-1 text-left hover:bg-muted"
      >
        {children}
      </Button>
    );
  }

  if (kind === "content-editor") {
    return (
      <Button nativeButton={false} render={<a href={href} />} size="sm" className="w-fit">
        <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} />
        {children}
      </Button>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={<a href={href} />}
      variant="outline"
      size="sm"
      className="w-fit"
    >
      {children}
    </Button>
  );
}

export function JobsPageErrorMessage({ error }: { error: unknown }) {
  const intl = useIntl();

  return (
    <>
      <TypographyP className="text-flame-100" size="small" weight="medium">
        <FormattedMessage {...jobsPageViewMessages.loadErrorTitle} />
      </TypographyP>
      <TypographyP className="mt-1" size="small" tone="subtle">
        {error instanceof Error
          ? error.message
          : intl.formatMessage(jobsPageViewMessages.loadErrorFallback)}
      </TypographyP>
    </>
  );
}

function JobsViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: JobsViewMode;
  onViewModeChange: (viewMode: JobsViewMode) => void;
}) {
  const intl = useIntl();

  return (
    <ButtonGroup aria-label={intl.formatMessage(jobsPageViewMessages.viewModeAriaLabel)}>
      <Button
        type="button"
        variant={viewMode === "row" ? "default" : "outline"}
        size="sm"
        className="h-9"
        onClick={() => onViewModeChange("row")}
      >
        <HugeiconsIcon icon={ListViewIcon} strokeWidth={1.8} />
        <FormattedMessage {...jobsPageViewMessages.viewModeRow} />
      </Button>
      <Button
        type="button"
        variant={viewMode === "kanban" ? "default" : "outline"}
        size="sm"
        className="h-9"
        onClick={() => onViewModeChange("kanban")}
      >
        <HugeiconsIcon icon={KanbanIcon} strokeWidth={1.8} />
        <FormattedMessage {...jobsPageViewMessages.viewModeBoard} />
      </Button>
    </ButtonGroup>
  );
}

function JobsCollection({
  activeStatus,
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  emptyLabel,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
  viewMode,
}: {
  activeStatus?: string;
  buildJobDetailHref?: typeof buildJobDetailHref;
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
  viewMode: JobsViewMode;
}) {
  if (viewMode === "kanban") {
    return (
      <JobsKanbanBoard
        buildJobDetailHref={buildDetailHref}
        emptyLabel={emptyLabel}
        isLoading={isLoading}
        jobs={jobs}
        now={now}
        organizationSlug={organizationSlug}
        projectId={projectId}
        renderJobLink={renderJobLink}
      />
    );
  }

  return (
    <JobsGroupedList
      buildJobDetailHref={buildDetailHref}
      emptyLabel={emptyLabel}
      isLoading={isLoading}
      jobs={jobs}
      now={now}
      organizationSlug={organizationSlug}
      projectId={projectId}
      renderJobLink={renderJobLink}
      activeStatus={activeStatus}
    />
  );
}

function JobsSectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <TypographyP size="small" weight="medium" tone="content">
        {title}
      </TypographyP>
      {description ? (
        <TypographyP className="leading-6" size="small" tone="subtle">
          {description}
        </TypographyP>
      ) : null}
    </div>
  );
}

function JobsResourceSection({
  activeStatus,
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  description,
  emptyLabel,
  error,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderError,
  renderJobLink,
  title,
  viewMode,
}: {
  activeStatus?: string;
  buildJobDetailHref?: typeof buildJobDetailHref;
  description?: string;
  emptyLabel: string;
  error?: unknown;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderError: JobsErrorRenderer;
  renderJobLink: JobsLinkRenderer;
  title: string;
  viewMode: JobsViewMode;
}) {
  return (
    <div className="space-y-3">
      <JobsSectionHeader title={title} description={description} />
      {error ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          {renderError({ error, organizationSlug })}
        </div>
      ) : (
        <JobsCollection
          activeStatus={activeStatus}
          buildJobDetailHref={buildDetailHref}
          emptyLabel={emptyLabel}
          isLoading={isLoading}
          jobs={jobs}
          now={now}
          organizationSlug={organizationSlug}
          projectId={projectId}
          renderJobLink={renderJobLink}
          viewMode={viewMode}
        />
      )}
    </div>
  );
}

export function JobsPageView({
  assignedNativeJobs = [],
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  createdNativeJobs = [],
  hasActiveTmsConnection = false,
  headerActions,
  initialSearch = "",
  initialStatusFilter = "all",
  isNativeLoading,
  isProviderProjectScope = false,
  isTmsLoading = false,
  nativeError,
  nativeJobs,
  now,
  onClearFilters,
  onSearchDraftChange,
  onStatusFilterChange,
  organizationSlug,
  projectId,
  renderError = ({ error }) => <JobsPageErrorMessage error={error} />,
  renderJobLink = defaultRenderJobLink,
  scope = "all",
  searchDraft: controlledSearchDraft,
  statusFilter: controlledStatusFilter,
  tmsError,
  tmsJobs = [],
}: {
  assignedNativeJobs?: JobRow[];
  buildJobDetailHref?: typeof buildJobDetailHref;
  createdNativeJobs?: JobRow[];
  hasActiveTmsConnection?: boolean;
  headerActions?: ReactNode;
  initialSearch?: string;
  initialStatusFilter?: JobsStatusFilter;
  isNativeLoading: boolean;
  isProviderProjectScope?: boolean;
  isTmsLoading?: boolean;
  nativeError?: unknown;
  nativeJobs: JobRow[];
  now?: number;
  onClearFilters?: () => void;
  onSearchDraftChange?: (value: string) => void;
  onStatusFilterChange?: (statusFilter: JobsStatusFilter) => void;
  organizationSlug: string;
  projectId?: string;
  renderError?: JobsErrorRenderer;
  renderJobLink?: JobsLinkRenderer;
  scope?: JobsScope;
  searchDraft?: string;
  statusFilter?: JobsStatusFilter;
  tmsError?: unknown;
  tmsJobs?: JobRow[];
}) {
  const intl = useIntl();
  const isSearchControlled = onSearchDraftChange != null;
  const [uncontrolledSearch, setUncontrolledSearch] = useState(initialSearch);
  const search = isSearchControlled ? (controlledSearchDraft ?? "") : uncontrolledSearch;
  const setSearch = isSearchControlled ? onSearchDraftChange : setUncontrolledSearch;
  const [viewMode, setViewMode] = useState<JobsViewMode>(projectId ? "kanban" : "row");
  const [uncontrolledStatusFilter, setUncontrolledStatusFilter] =
    useState<JobsStatusFilter>(initialStatusFilter);
  const statusFilter = controlledStatusFilter ?? uncontrolledStatusFilter;
  const listViewMode = projectId ? viewMode : "row";
  const activeStatus = statusFilter === "all" ? undefined : statusFilter;

  useEffect(() => {
    if (!projectId) {
      return;
    }
    setViewMode(readJobsViewMode());
  }, [projectId]);

  const handleViewModeChange = (nextViewMode: JobsViewMode) => {
    setViewMode(nextViewMode);
    writeJobsViewMode(nextViewMode);
  };

  const handleStatusFilterChange = (nextStatusFilter: JobsStatusFilter) => {
    if (controlledStatusFilter === undefined) {
      setUncontrolledStatusFilter(nextStatusFilter);
    }
    onStatusFilterChange?.(nextStatusFilter);
  };

  const handleClearFilters = () => {
    if (onClearFilters) {
      onClearFilters();
      return;
    }
    setSearch("");
    handleStatusFilterChange("all");
  };

  const filterJobs = (jobs: JobRow[]) => {
    const normalizedSearch = search.trim().toLowerCase();
    return jobs.filter((job) => jobMatchesFilters(job, { search: normalizedSearch, statusFilter }));
  };

  const visibleNativeJobs = useMemo(
    () => filterJobs(nativeJobs),
    [nativeJobs, search, statusFilter],
  );
  const visibleTmsJobs = useMemo(() => filterJobs(tmsJobs), [tmsJobs, search, statusFilter]);
  const visibleAssignedNativeJobs = useMemo(
    () => filterJobs(assignedNativeJobs),
    [assignedNativeJobs, search, statusFilter],
  );
  const visibleCreatedNativeJobs = useMemo(
    () => filterJobs(createdNativeJobs),
    [createdNativeJobs, search, statusFilter],
  );

  const isPersonalWork = scope === "personal";
  const showNativeSection = !isProviderProjectScope;
  const showTmsSection = isProviderProjectScope || (!projectId && hasActiveTmsConnection);

  const nativeEmptyLabel = projectId
    ? intl.formatMessage(jobsPageViewMessages.emptyNativeProject)
    : scope === "personal"
      ? intl.formatMessage(jobsPageViewMessages.emptyNativePersonal)
      : intl.formatMessage(jobsPageViewMessages.emptyNativeWorkspace);
  const tmsEmptyLabel = projectId
    ? intl.formatMessage(jobsPageViewMessages.emptyTmsProject)
    : scope === "personal"
      ? intl.formatMessage(jobsPageViewMessages.emptyTmsPersonal)
      : intl.formatMessage(jobsPageViewMessages.emptyTmsWorkspace);
  const nativeJobsTitle = intl.formatMessage(jobsPageViewMessages.nativeJobsTitle);
  const tmsJobsTitle = intl.formatMessage(jobsPageViewMessages.tmsJobsTitle);

  const jobsSection = (
    <section className="space-y-8">
      <JobsListToolbar
        searchDraft={search}
        onSearchDraftChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        onClearFilters={handleClearFilters}
        trailing={
          projectId ? (
            <JobsViewModeToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          ) : null
        }
      />

      {isPersonalWork ? (
        <>
          <div className="space-y-8">
            <JobsSectionHeader
              title={intl.formatMessage(jobsPageViewMessages.sectionAssignedToMe)}
            />
            {showNativeSection ? (
              <JobsResourceSection
                activeStatus={activeStatus}
                buildJobDetailHref={buildDetailHref}
                emptyLabel={intl.formatMessage(jobsPageViewMessages.emptyAssignedNative)}
                error={nativeError}
                isLoading={isNativeLoading}
                jobs={visibleAssignedNativeJobs}
                now={now}
                organizationSlug={organizationSlug}
                projectId={projectId}
                renderError={renderError}
                renderJobLink={renderJobLink}
                title={nativeJobsTitle}
                viewMode={listViewMode}
              />
            ) : null}
            {showTmsSection ? (
              <JobsResourceSection
                activeStatus={activeStatus}
                buildJobDetailHref={buildDetailHref}
                emptyLabel={intl.formatMessage(jobsPageViewMessages.emptyAssignedTms)}
                error={tmsError}
                isLoading={isTmsLoading}
                jobs={visibleTmsJobs}
                now={now}
                organizationSlug={organizationSlug}
                projectId={projectId}
                renderError={renderError}
                renderJobLink={renderJobLink}
                title={tmsJobsTitle}
                description={intl.formatMessage(jobsPageViewMessages.tmsJobsAssignedDescription)}
                viewMode={listViewMode}
              />
            ) : null}
          </div>
          <div className="space-y-8">
            <JobsSectionHeader
              title={intl.formatMessage(jobsPageViewMessages.sectionCreatedByMe)}
            />
            <JobsResourceSection
              activeStatus={activeStatus}
              buildJobDetailHref={buildDetailHref}
              emptyLabel={intl.formatMessage(jobsPageViewMessages.emptyCreatedNative)}
              error={nativeError}
              isLoading={isNativeLoading}
              jobs={visibleCreatedNativeJobs}
              now={now}
              organizationSlug={organizationSlug}
              projectId={projectId}
              renderError={renderError}
              renderJobLink={renderJobLink}
              title={nativeJobsTitle}
              viewMode={listViewMode}
            />
          </div>
        </>
      ) : (
        <>
          {showNativeSection ? (
            <JobsResourceSection
              activeStatus={activeStatus}
              buildJobDetailHref={buildDetailHref}
              emptyLabel={nativeEmptyLabel}
              error={nativeError}
              isLoading={isNativeLoading}
              jobs={visibleNativeJobs}
              now={now}
              organizationSlug={organizationSlug}
              projectId={projectId}
              renderError={renderError}
              renderJobLink={renderJobLink}
              title={nativeJobsTitle}
              description={intl.formatMessage(jobsPageViewMessages.nativeJobsDescription)}
              viewMode={listViewMode}
            />
          ) : null}
          {showTmsSection ? (
            <JobsResourceSection
              activeStatus={activeStatus}
              buildJobDetailHref={buildDetailHref}
              emptyLabel={tmsEmptyLabel}
              error={tmsError}
              isLoading={isTmsLoading}
              jobs={visibleTmsJobs}
              now={now}
              organizationSlug={organizationSlug}
              projectId={projectId}
              renderError={renderError}
              renderJobLink={renderJobLink}
              title={tmsJobsTitle}
              description={intl.formatMessage(jobsPageViewMessages.tmsJobsDescription)}
              viewMode={listViewMode}
            />
          ) : null}
        </>
      )}
    </section>
  );

  if (projectId) {
    return (
      <ProjectPageShell>
        <ProjectSectionHeader
          icon={CenterFocusIcon}
          section={intl.formatMessage(jobsPageViewMessages.projectSectionLabel)}
          description={intl.formatMessage(jobsPageViewMessages.projectSectionDescription)}
          actions={headerActions}
        />
        {jobsSection}
      </ProjectPageShell>
    );
  }

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={CenterFocusIcon}
        label={intl.formatMessage(jobsPageViewMessages.workspaceLabel)}
        title={
          isPersonalWork
            ? intl.formatMessage(jobsPageViewMessages.pageTitleMyJobs)
            : intl.formatMessage(jobsPageViewMessages.pageTitleJobs)
        }
        description={
          isPersonalWork
            ? intl.formatMessage(jobsPageViewMessages.pageDescriptionPersonal)
            : intl.formatMessage(jobsPageViewMessages.pageDescriptionWorkspace)
        }
        actions={headerActions}
      />
      {jobsSection}
    </WorkspacePageShell>
  );
}
