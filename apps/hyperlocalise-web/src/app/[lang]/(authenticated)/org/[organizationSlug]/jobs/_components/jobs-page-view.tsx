"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  KanbanIcon,
  ListViewIcon,
  SearchIcon,
  Task01Icon,
  TranslateIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import { JobsKanbanBoard, JobRowActions } from "./jobs-kanban-board";
import {
  buildJobDetailHref,
  readJobsViewMode,
  writeJobsViewMode,
  type JobsViewMode,
} from "./jobs-view-helpers";
import {
  getJobStatusMessage,
  getJobsStatusFilterMessage,
  jobsPageViewMessages,
} from "./jobs-page-view.messages";
import { formatLocaleList, getCrowdinTargetLocales } from "./provider-crowdin-job-display";

import {
  PageHeader,
  WorkspacePageShell,
  toneClass,
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

type JobLinkKind = "title" | "details" | "cat";

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

const jobsFilterTriggerClassName =
  "h-9 min-h-9 w-full border-border bg-transparent px-3 text-sm text-foreground data-[size=default]:h-9";

const jobsFilterSelectContentClassName =
  "w-max min-w-[var(--anchor-width)] max-w-[min(16rem,calc(100vw-2rem))]";

const jobsTableGridClassName =
  "grid grid-cols-[minmax(13rem,1.35fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_7.5rem_minmax(10rem,1fr)_minmax(11rem,auto)] gap-3";

function JobsFilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
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
  return "—";
}

function assignees(job: ApiJob) {
  if (job.externalAssignedUsers?.length) return job.externalAssignedUsers.join(", ");
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
  const sourceFileId = getInputPayloadString(job, "sourceFileId");
  if (sourceFileId) return formatJobName(sourceFileId);
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
      : [];
  const locales = formatLocaleList(getCrowdinTargetLocales(null, fallbackTargetLocales));
  const people = assignees(job);
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

  if (kind === "cat") {
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
      <TypographyP className="text-sm font-medium text-flame-100">
        <FormattedMessage {...jobsPageViewMessages.loadErrorTitle} />
      </TypographyP>
      <TypographyP className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : intl.formatMessage(jobsPageViewMessages.loadErrorFallback)}
      </TypographyP>
    </>
  );
}

function JobsList({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  emptyLabel,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const intl = useIntl();

  if (isLoading)
    return (
      <TypographyP className="px-3 py-8 text-sm text-muted-foreground">
        <FormattedMessage {...jobsPageViewMessages.loadingJobs} />
      </TypographyP>
    );
  if (jobs.length === 0) {
    return (
      <TypographyP className="px-3 py-8 text-sm text-muted-foreground">{emptyLabel}</TypographyP>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[56rem]">
        <div
          className={cn(
            jobsTableGridClassName,
            "px-3 py-3 text-sm font-medium text-muted-foreground",
          )}
        >
          <TypographyP>
            <FormattedMessage {...jobsPageViewMessages.columnName} />
          </TypographyP>
          <TypographyP>
            <FormattedMessage {...jobsPageViewMessages.columnSource} />
          </TypographyP>
          <TypographyP>
            <FormattedMessage {...jobsPageViewMessages.columnProject} />
          </TypographyP>
          <TypographyP>
            <FormattedMessage {...jobsPageViewMessages.columnStatus} />
          </TypographyP>
          <TypographyP>
            <FormattedMessage {...jobsPageViewMessages.columnTaskDetails} />
          </TypographyP>
          <TypographyP className="text-end">
            <FormattedMessage {...jobsPageViewMessages.columnActions} />
          </TypographyP>
        </div>
        {jobs.map((job, index) => {
          const detailHref = buildDetailHref(organizationSlug, projectId ?? job.projectId, job.id);

          return (
            <div key={job.id}>
              <div className={cn(jobsTableGridClassName, "items-center px-3 py-3")}>
                {detailHref ? (
                  renderJobLink({
                    href: detailHref,
                    kind: "title",
                    children: <JobListItemTitle job={job} />,
                  })
                ) : (
                  <div className="min-w-0 px-0 py-1">
                    <JobListItemTitle job={job} />
                  </div>
                )}
                <JobSourceLabel job={job} />
                <TypographyP className="truncate text-sm text-muted-foreground">
                  {job.projectName ??
                    job.projectId ??
                    intl.formatMessage(jobsPageViewMessages.workspaceFallback)}
                </TypographyP>
                <Badge
                  variant="outline"
                  className={cn("w-fit rounded-full", toneClass(jobTone(job.status)))}
                >
                  {intl.formatMessage(getJobStatusMessage(job.status))}
                </Badge>
                <div className="min-w-0">
                  <TypographyP className="truncate text-sm text-subtle-foreground">
                    {taskDetailSummary(job, intl)}
                  </TypographyP>
                  <TypographyP className="mt-1 truncate text-xs text-muted-foreground">
                    <FormattedMessage
                      {...jobsPageViewMessages.dueSyncedMeta}
                      values={{
                        due: formatRelativeTime(job.externalDueDate, now),
                        synced: formatRelativeTime(job.updatedAt, now),
                      }}
                    />
                  </TypographyP>
                </div>
                <JobRowActions
                  buildJobDetailHref={buildDetailHref}
                  job={job}
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  renderJobLink={renderJobLink}
                />
              </div>
              {index < jobs.length - 1 ? <Separator className="bg-skeleton" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobListItemTitle({ job }: { job: ApiJob }) {
  const intl = useIntl();

  return (
    <span className="min-w-0">
      <span className="block truncate text-base font-medium text-foreground">
        {getJobName(job, intl)}
      </span>
      <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
        <FormattedMessage
          {...jobsPageViewMessages.kindWithTaskId}
          values={{
            kind: formatJobKind(job, intl),
            taskId: job.externalTaskId ?? job.id,
          }}
        />
      </span>
    </span>
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
    <JobsList
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

function JobsSectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <TypographyP className="text-sm font-medium text-foreground">{title}</TypographyP>
      {description ? (
        <TypographyP className="text-sm leading-6 text-muted-foreground">{description}</TypographyP>
      ) : null}
    </div>
  );
}

function JobsResourceSection({
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
      {error ? <div>{renderError({ error, organizationSlug })}</div> : null}
      <JobsCollection
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
  onStatusFilterChange,
  organizationSlug,
  projectId,
  renderError = ({ error }) => <JobsPageErrorMessage error={error} />,
  renderJobLink = defaultRenderJobLink,
  scope = "all",
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
  onStatusFilterChange?: (statusFilter: JobsStatusFilter) => void;
  organizationSlug: string;
  projectId?: string;
  renderError?: JobsErrorRenderer;
  renderJobLink?: JobsLinkRenderer;
  scope?: JobsScope;
  statusFilter?: JobsStatusFilter;
  tmsError?: unknown;
  tmsJobs?: JobRow[];
}) {
  const intl = useIntl();
  const searchId = useId();
  const [search, setSearch] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<JobsViewMode>("kanban");
  const [uncontrolledStatusFilter, setUncontrolledStatusFilter] =
    useState<JobsStatusFilter>(initialStatusFilter);
  const statusFilter = controlledStatusFilter ?? uncontrolledStatusFilter;

  useEffect(() => {
    setViewMode(readJobsViewMode());
  }, []);

  const handleViewModeChange = (nextViewMode: JobsViewMode) => {
    setViewMode(nextViewMode);
    writeJobsViewMode(nextViewMode);
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
  const statusFilterLabel = intl.formatMessage(getJobsStatusFilterMessage(statusFilter));
  const nativeJobsTitle = intl.formatMessage(jobsPageViewMessages.nativeJobsTitle);
  const tmsJobsTitle = intl.formatMessage(jobsPageViewMessages.tmsJobsTitle);

  const jobsSection = (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <JobsFilterField
          label={intl.formatMessage(jobsPageViewMessages.filterSearch)}
          className="min-w-0 flex-1"
        >
          <div className="relative">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={intl.formatMessage(jobsPageViewMessages.filterSearchPlaceholder)}
              className="h-9 border-border bg-transparent pl-9 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </JobsFilterField>
        <JobsFilterField
          label={intl.formatMessage(jobsPageViewMessages.filterStatus)}
          className="w-full lg:w-40"
        >
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              const nextStatusFilter = (value ?? "all") as JobsStatusFilter;
              if (controlledStatusFilter === undefined) {
                setUncontrolledStatusFilter(nextStatusFilter);
              }
              onStatusFilterChange?.(nextStatusFilter);
            }}
          >
            <SelectTrigger className={jobsFilterTriggerClassName}>
              <SelectValue>{statusFilterLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={jobsFilterSelectContentClassName}>
              {jobsStatusOptions.map((status) => {
                const label = intl.formatMessage(getJobsStatusFilterMessage(status));
                return (
                  <SelectItem key={status} value={status} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </JobsFilterField>
        {projectId ? (
          <JobsFilterField
            label={intl.formatMessage(jobsPageViewMessages.filterView)}
            className="w-full lg:w-auto"
          >
            <JobsViewModeToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          </JobsFilterField>
        ) : null}
      </div>

      {isPersonalWork ? (
        <>
          <div className="space-y-8">
            <JobsSectionHeader
              title={intl.formatMessage(jobsPageViewMessages.sectionAssignedToMe)}
            />
            {showNativeSection ? (
              <JobsResourceSection
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
                viewMode={viewMode}
              />
            ) : null}
            {showTmsSection ? (
              <JobsResourceSection
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
                viewMode={viewMode}
              />
            ) : null}
          </div>
          <div className="space-y-8">
            <JobsSectionHeader
              title={intl.formatMessage(jobsPageViewMessages.sectionCreatedByMe)}
            />
            <JobsResourceSection
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
              viewMode={viewMode}
            />
          </div>
        </>
      ) : (
        <>
          {showNativeSection ? (
            <JobsResourceSection
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
              viewMode={viewMode}
            />
          ) : null}
          {showTmsSection ? (
            <JobsResourceSection
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
              viewMode={viewMode}
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
          icon={Task01Icon}
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
        icon={isPersonalWork ? WorkHistoryIcon : Task01Icon}
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
