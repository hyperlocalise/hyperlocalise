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
import { TmsProviderBrandMark } from "@/lib/providers/tms-provider-brand-mark";
import { getTmsProviderBranding } from "@/lib/providers/tms-provider-branding";

import { JobsKanbanBoard, JobRowActions } from "./jobs-kanban-board";
import {
  buildJobDetailHref,
  readJobsViewMode,
  writeJobsViewMode,
  type JobsViewMode,
} from "./jobs-view-helpers";
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
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
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

const statusFilterLabels = {
  all: "All status",
  ...jobStatusLabels,
} as const satisfies Record<JobsStatusFilter, string>;

export function formatJobStatusLabel(status: ApiJob["status"]) {
  return jobStatusLabels[status];
}

const jobsFilterTriggerClassName =
  "h-9 min-h-9 w-full border-foreground/14 bg-transparent px-3 text-sm text-foreground data-[size=default]:h-9";

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

export function getJobName(job: ApiJob) {
  if (job.externalTitle) return formatJobName(job.externalTitle);
  if (job.kind === "review" && job.reviewCriteria)
    return formatJobName(`Review: ${job.reviewCriteria}`);
  if (job.kind === "sync" && job.syncConnectorKind)
    return formatJobName(`${job.syncDirection ?? "sync"} ${job.syncConnectorKind}`);
  if (job.kind === "asset_management" && job.assetType)
    return formatJobName(`${job.assetOperation ?? "manage"} ${job.assetType}`);
  const researchScope = getInputPayloadString(job, "scope");
  if (job.kind === "research" && researchScope) return formatJobName(`Research: ${researchScope}`);
  const sourceText = getInputPayloadString(job, "sourceText");
  if (sourceText) return formatJobName(sourceText);
  const sourceFileId = getInputPayloadString(job, "sourceFileId");
  if (sourceFileId) return formatJobName(sourceFileId);
  return job.id;
}

export function formatJobKind(job: ApiJob) {
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

export function taskDetailSummary(job: ApiJob) {
  const fallbackTargetLocales = job.externalTargetLocales?.length
    ? job.externalTargetLocales
    : job.reviewTargetLocale
      ? [job.reviewTargetLocale]
      : [];
  const locales = formatLocaleList(getCrowdinTargetLocales(null, fallbackTargetLocales));
  const people = assignees(job);
  if (locales === "—" && people === "—") return "No locales or assignees";
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
        className="-mx-2 h-auto min-w-0 justify-start px-2 py-1 text-left hover:bg-foreground/6"
      >
        {children}
      </Button>
    );
  }

  if (kind === "cat") {
    return (
      <Button
        nativeButton={false}
        render={<a href={href} />}
        variant="outline"
        size="sm"
        className="w-fit"
      >
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
  return (
    <>
      <TypographyP className="text-sm font-medium text-flame-100">Jobs failed to load.</TypographyP>
      <TypographyP className="mt-1 text-sm text-foreground/58">
        {error instanceof Error ? error.message : "Failed to load jobs."}
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
  if (isLoading)
    return (
      <TypographyP className="px-3 py-8 text-sm text-foreground/58">Loading jobs…</TypographyP>
    );
  if (jobs.length === 0) {
    return <TypographyP className="px-3 py-8 text-sm text-foreground/58">{emptyLabel}</TypographyP>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[56rem]">
        <div
          className={cn(jobsTableGridClassName, "px-3 py-3 text-sm font-medium text-foreground/42")}
        >
          <TypographyP>Name</TypographyP>
          <TypographyP>Source</TypographyP>
          <TypographyP>Project</TypographyP>
          <TypographyP>Status</TypographyP>
          <TypographyP>Task details</TypographyP>
          <TypographyP className="text-end">Actions</TypographyP>
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
                <TypographyP className="truncate text-sm text-foreground/58">
                  {job.projectName ?? job.projectId ?? "Workspace"}
                </TypographyP>
                <Badge
                  variant="outline"
                  className={cn("w-fit rounded-full", toneClass(jobTone(job.status)))}
                >
                  {formatJobStatusLabel(job.status)}
                </Badge>
                <div className="min-w-0">
                  <TypographyP className="truncate text-sm text-foreground/68">
                    {taskDetailSummary(job)}
                  </TypographyP>
                  <TypographyP className="mt-1 truncate text-xs text-foreground/38">
                    Due {formatRelativeTime(job.externalDueDate, now)} · Synced{" "}
                    {formatRelativeTime(job.updatedAt, now)}
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
              {index < jobs.length - 1 ? <Separator className="bg-foreground/8" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobListItemTitle({ job }: { job: ApiJob }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-base font-medium text-foreground">
        {getJobName(job)}
      </span>
      <span className="mt-1 block truncate text-xs font-normal text-foreground/38">
        {formatJobKind(job)} · {job.externalTaskId ?? job.id}
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
  return (
    <ButtonGroup aria-label="Jobs view mode">
      <Button
        type="button"
        variant={viewMode === "row" ? "default" : "outline"}
        size="sm"
        className="h-9"
        onClick={() => onViewModeChange("row")}
      >
        <HugeiconsIcon icon={ListViewIcon} strokeWidth={1.8} />
        Row
      </Button>
      <Button
        type="button"
        variant={viewMode === "kanban" ? "default" : "outline"}
        size="sm"
        className="h-9"
        onClick={() => onViewModeChange("kanban")}
      >
        <HugeiconsIcon icon={KanbanIcon} strokeWidth={1.8} />
        Board
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
        <TypographyP className="text-sm leading-6 text-foreground/52">{description}</TypographyP>
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
  const searchId = useId();
  const [search, setSearch] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<JobsViewMode>("row");
  const [uncontrolledStatusFilter, setUncontrolledStatusFilter] =
    useState<JobsStatusFilter>(initialStatusFilter);
  const statusFilter = controlledStatusFilter ?? uncontrolledStatusFilter;

  useEffect(() => {
    if (!projectId) {
      return;
    }

    setViewMode(readJobsViewMode());
  }, [projectId]);

  const handleViewModeChange = (nextViewMode: JobsViewMode) => {
    setViewMode(nextViewMode);
    if (projectId) {
      writeJobsViewMode(nextViewMode);
    }
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
  const showTmsSection = hasActiveTmsConnection || isProviderProjectScope;

  const nativeEmptyLabel = projectId
    ? "No Hyperlocalise jobs found for this project yet."
    : scope === "personal"
      ? "No Hyperlocalise work items found for your account."
      : "No Hyperlocalise jobs found for this workspace.";
  const tmsEmptyLabel = projectId
    ? "No TMS jobs found for this project."
    : scope === "personal"
      ? "No TMS jobs assigned to you were returned from the live provider API."
      : "No TMS jobs were returned from the live provider API.";

  const jobsSection = (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <JobsFilterField label="Search" className="min-w-0 flex-1">
          <div className="relative">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/42"
            />
            <Input
              id={searchId}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Jobs, providers, locales, assignees..."
              className="h-9 border-foreground/14 bg-transparent pl-9 text-foreground placeholder:text-foreground/42"
            />
          </div>
        </JobsFilterField>
        <JobsFilterField label="Status" className="w-full lg:w-40">
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
              <SelectValue>{statusFilterLabels[statusFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent className={jobsFilterSelectContentClassName}>
              {jobsStatusOptions.map((status) => (
                <SelectItem key={status} value={status} label={statusFilterLabels[status]}>
                  {statusFilterLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </JobsFilterField>
        {projectId ? (
          <JobsFilterField label="View" className="w-full lg:w-auto">
            <JobsViewModeToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          </JobsFilterField>
        ) : null}
      </div>

      {isPersonalWork ? (
        <>
          <div className="space-y-8">
            <JobsSectionHeader title="Assigned to me" />
            {showNativeSection ? (
              <JobsResourceSection
                buildJobDetailHref={buildDetailHref}
                emptyLabel="No assigned Hyperlocalise jobs found."
                error={nativeError}
                isLoading={isNativeLoading}
                jobs={visibleAssignedNativeJobs}
                now={now}
                organizationSlug={organizationSlug}
                projectId={projectId}
                renderError={renderError}
                renderJobLink={renderJobLink}
                title="Hyperlocalise jobs"
                viewMode={viewMode}
              />
            ) : null}
            {showTmsSection ? (
              <JobsResourceSection
                buildJobDetailHref={buildDetailHref}
                emptyLabel="No assigned TMS jobs found."
                error={tmsError}
                isLoading={isTmsLoading}
                jobs={visibleTmsJobs}
                now={now}
                organizationSlug={organizationSlug}
                projectId={projectId}
                renderError={renderError}
                renderJobLink={renderJobLink}
                title="TMS jobs"
                description="Live jobs assigned to you in the connected provider."
                viewMode={viewMode}
              />
            ) : null}
          </div>
          <div className="space-y-8">
            <JobsSectionHeader title="Created by me" />
            <JobsResourceSection
              buildJobDetailHref={buildDetailHref}
              emptyLabel="No Hyperlocalise jobs created by you found."
              error={nativeError}
              isLoading={isNativeLoading}
              jobs={visibleCreatedNativeJobs}
              now={now}
              organizationSlug={organizationSlug}
              projectId={projectId}
              renderError={renderError}
              renderJobLink={renderJobLink}
              title="Hyperlocalise jobs"
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
              title="Hyperlocalise jobs"
              description="Jobs created and tracked in this workspace."
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
              title="TMS jobs"
              description="Live jobs fetched from your connected TMS provider."
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
          section="Jobs"
          description="Translation, review, QA, and sync work from Hyperlocalise and your TMS."
        />
        {jobsSection}
      </ProjectPageShell>
    );
  }

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={isPersonalWork ? WorkHistoryIcon : Task01Icon}
        label="Workspace"
        title={isPersonalWork ? "My Jobs" : "Jobs"}
        description={
          isPersonalWork
            ? "Hyperlocalise and live TMS work assigned to you or created by you."
            : "Hyperlocalise jobs and live TMS jobs tracked across the workspace."
        }
      />
      {jobsSection}
    </WorkspacePageShell>
  );
}
