"use client";

import type { ReactNode } from "react";
import {
  Clock01Icon,
  File01Icon,
  LanguageSquareIcon,
  LinkSquare02Icon,
  RefreshIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1, TypographyH2 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import type {
  TmsProviderLiveJobComment,
  TmsProviderLiveJobDetail,
} from "@/lib/providers/tms-provider-live";

import { toneClass } from "../../../../../_components/workspace-resource-shared";
import { JobDetailRow } from "../../../../../jobs/_components/provider-crowdin-job-detail-rows";
import {
  formatReadinessProgress,
  formatLocaleList,
  getCrowdinTargetLocales,
  formatWordsToDo,
  getCrowdinLanguageLabel,
  getCrowdinLocaleReadiness,
  getCrowdinTaskTypeLabel,
  getProviderPayloadString,
  getReadinessNumber,
  getReadinessWords,
} from "../../../../../jobs/_components/provider-crowdin-job-display";

import { buildJobsListHref, formatJobDetailDate } from "./job-detail-types";
import {
  defaultRenderBackLink,
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./native-job-detail-view";

export type ProviderLiveDescriptionFieldRenderer = (props: {
  description: string;
  editable: boolean;
  job: TmsProviderLiveJobDetail;
}) => ReactNode;

export type ProviderLiveFilesSectionRenderer = (props: {
  job: TmsProviderLiveJobDetail;
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

function statusTone(status: TmsProviderLiveJobDetail["status"]) {
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

function formatJobKind(job: TmsProviderLiveJobDetail) {
  return job.kind.replaceAll("_", " ");
}

function formatProviderKind(kind: string | null | undefined) {
  if (!kind) return "Provider";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatTimeSpent(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function MetricItem({
  icon,
  label,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground/58">
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4 shrink-0 text-foreground/42" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function getProgressValue(job: TmsProviderLiveJobDetail) {
  const readiness = getCrowdinLocaleReadiness(job.externalProviderPayload);
  const translationProgress = getReadinessNumber(readiness, "translationProgress");
  const approvalProgress = getReadinessNumber(readiness, "approvalProgress");
  return Math.max(0, Math.min(100, Math.round(translationProgress ?? approvalProgress ?? 0)));
}

function getWordsProgress(job: TmsProviderLiveJobDetail) {
  const readiness = getCrowdinLocaleReadiness(job.externalProviderPayload);
  const words = getReadinessWords(readiness);
  const total = getReadinessNumber(words, "total");
  const translated = getReadinessNumber(words, "translated");
  const approved = getReadinessNumber(words, "approved");

  if (total === null) {
    return null;
  }

  return {
    completed: Math.max(0, translated ?? approved ?? 0),
    total,
  };
}

function StatusSummaryCard({ job }: { job: TmsProviderLiveJobDetail }) {
  const readiness = getCrowdinLocaleReadiness(job.externalProviderPayload);
  const hasReadiness = readiness !== null;
  const progress = hasReadiness ? getProgressValue(job) : null;
  const progressLabel =
    hasReadiness && progress !== null
      ? (formatReadinessProgress(readiness) ?? `${progress}% translated`)
      : null;
  const wordsProgress = hasReadiness ? getWordsProgress(job) : null;

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Status
      </TypographyH2>
      <Badge
        variant="outline"
        className={cn("mt-5 w-fit rounded-full capitalize", toneClass(statusTone(job.status)))}
      >
        {job.status}
      </Badge>
      {progress !== null && progressLabel !== null ? (
        <div className="mt-7">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground">{progress}%</span>
            <span className="text-sm text-foreground/58">
              {progressLabel.replace(/^\d+%\s*/, "")}
            </span>
          </div>
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-label="Translation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          {wordsProgress ? (
            <p className="mt-3 text-sm text-foreground/52">
              {wordsProgress.completed} / {wordsProgress.total} words
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm text-foreground/58">
          Provider status: {job.externalStatus || job.status}
        </p>
      )}
    </section>
  );
}

function TaskDetailsCard({ job }: { job: TmsProviderLiveJobDetail }) {
  const providerName = formatProviderKind(job.externalProviderKind);
  const targetLocales = formatLocaleList(
    getCrowdinTargetLocales(job.externalProviderPayload, job.externalTargetLocales),
  );
  const taskType = getCrowdinTaskTypeLabel(job.externalProviderPayload) ?? formatJobKind(job);
  const wordsToDo = formatWordsToDo(getCrowdinLocaleReadiness(job.externalProviderPayload));

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Details
      </TypographyH2>
      <dl className="mt-3 divide-y divide-foreground/8">
        <JobDetailRow label="Provider" value={providerName} />
        <JobDetailRow label="Task type" value={taskType} />
        <JobDetailRow label="Project" value={job.projectName ?? job.projectId} />
        <JobDetailRow
          label="Language"
          value={getCrowdinLanguageLabel(job.externalProviderPayload) ?? "—"}
        />
        <JobDetailRow label="Target locales" value={targetLocales} />
        <JobDetailRow
          label="Assignees"
          value={job.externalAssignedUsers.length > 0 ? job.externalAssignedUsers.join(", ") : "—"}
        />
        <JobDetailRow label="Due date" value={formatJobDetailDate(job.externalDueDate)} />
        <JobDetailRow label="Last sync" value={formatJobDetailDate(job.updatedAt)} />
        {wordsToDo ? <JobDetailRow label="Words to do" value={wordsToDo} /> : null}
        <JobDetailRow label="External job ID" value={job.externalJobId} />
        <JobDetailRow label="External task ID" value={job.externalTaskId} />
      </dl>
    </section>
  );
}

function TaskCommentsSection({
  comments,
  isError,
  isLoading,
}: {
  comments: TmsProviderLiveJobComment[];
  isError: boolean;
  isLoading: boolean;
}) {
  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Task comments
      </TypographyH2>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full bg-foreground/8" />
          <Skeleton className="h-16 w-full bg-foreground/8" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">Unable to load task comments.</p>
      ) : null}

      {!isLoading && !isError && comments.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/52">No task comments yet.</p>
      ) : null}

      {!isLoading && !isError && comments.length > 0 ? (
        <ul className="mt-4 divide-y divide-foreground/8 rounded-md border border-foreground/8 bg-background/50">
          {comments.map((comment) => {
            const timeSpent = formatTimeSpent(comment.timeSpentSeconds);

            return (
              <li key={comment.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">User {comment.userId}</span>
                  <span className="text-xs text-foreground/42">
                    {formatJobDetailDate(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/74">
                  {comment.text}
                </p>
                {timeSpent ? (
                  <p className="mt-2 text-xs text-foreground/42">Time spent: {timeSpent}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function TaskActivitySection({ job }: { job: TmsProviderLiveJobDetail }) {
  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Activity
      </TypographyH2>
      <ul className="mt-4 divide-y divide-foreground/8 rounded-md border border-foreground/8 bg-background/50">
        <li className="px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Task refreshed</span>
            <span className="text-xs text-foreground/42">{formatJobDetailDate(job.updatedAt)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground/58">
            Latest provider status is {job.status}.
          </p>
        </li>
      </ul>
    </section>
  );
}

export function ProviderLiveJobDetailView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  canEditProviderJobDescription = false,
  comments = [],
  commentsError,
  commentsLoading = false,
  error,
  isLoading,
  isRefreshing = false,
  job,
  jobId,
  onRefresh,
  organizationSlug,
  projectId,
  renderBackLink = defaultRenderBackLink,
  renderDescriptionField,
  renderError = defaultRenderError,
  renderExternalLink,
  renderFilesSection,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  canEditProviderJobDescription?: boolean;
  comments?: TmsProviderLiveJobComment[];
  commentsError?: unknown;
  commentsLoading?: boolean;
  error?: unknown;
  isLoading: boolean;
  isRefreshing?: boolean;
  job?: TmsProviderLiveJobDetail;
  jobId: string;
  onRefresh?: () => void;
  organizationSlug: string;
  projectId: string;
  renderBackLink?: JobDetailBackLinkRenderer;
  renderDescriptionField?: ProviderLiveDescriptionFieldRenderer;
  renderError?: JobDetailErrorRenderer;
  renderExternalLink?: (props: { href: string; label: string }) => ReactNode;
  renderFilesSection?: ProviderLiveFilesSectionRenderer;
}) {
  const providerDescription = job
    ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
    : "";
  const canEditProviderDescription = Boolean(
    job && canEditProviderJobDescription && job.id.startsWith("ext:"),
  );
  const showTaskDescriptionSection =
    providerDescription.trim().length > 0 || canEditProviderDescription;
  const jobsListHref = buildJobsListHrefProp(organizationSlug, projectId);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {renderBackLink({ href: jobsListHref, children: "Jobs" })}
          <TypographyH1 className="wrap-break-word font-heading text-3xl font-semibold text-foreground md:text-4xl">
            {job?.externalTitle ?? jobId}
          </TypographyH1>
          {job ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <MetricItem
                icon={Task01Icon}
                label={`${formatProviderKind(job.externalProviderKind)} task`}
              />
              <MetricItem
                icon={LanguageSquareIcon}
                label={
                  getCrowdinLanguageLabel(job.externalProviderPayload) ??
                  formatLocaleList(
                    getCrowdinTargetLocales(job.externalProviderPayload, job.externalTargetLocales),
                  )
                }
              />
              <MetricItem
                icon={File01Icon}
                label={
                  formatWordsToDo(getCrowdinLocaleReadiness(job.externalProviderPayload)) ??
                  "Source files linked"
                }
              />
              <MetricItem
                icon={Clock01Icon}
                label={`Last synced ${formatJobDetailDate(job.updatedAt)}`}
              />
            </div>
          ) : null}
        </div>
        {job ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {job.externalUrl ? (
                renderExternalLink ? (
                  renderExternalLink({
                    href: job.externalUrl,
                    label: `Open in ${job.externalProviderKind}`,
                  })
                ) : (
                  <Button
                    nativeButton={false}
                    render={
                      <a href={job.externalUrl} target="_blank" rel="noreferrer noopener">
                        <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} />
                        Open in {job.externalProviderKind}
                      </a>
                    }
                    size="sm"
                    variant="outline"
                  />
                )
              ) : null}
              {onRefresh ? (
                <Button size="sm" variant="outline" disabled={isRefreshing} onClick={onRefresh}>
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </Button>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="sm" disabled>
                      Run with agent
                    </Button>
                  }
                />
                <TooltipContent>Agent workflows on provider tasks are coming soon.</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      ) : null}

      {error ? renderError({ error }) : null}

      {job ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {showTaskDescriptionSection && renderDescriptionField ? (
              <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
                <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                  Task description
                </TypographyH2>
                <div className="mt-4">
                  {renderDescriptionField({
                    description: providerDescription,
                    editable: canEditProviderDescription,
                    job,
                  })}
                </div>
              </section>
            ) : null}

            {job.externalProviderKind === "crowdin" && renderFilesSection
              ? renderFilesSection({ job, jobId, organizationSlug, projectId })
              : null}
          </div>
          <aside className="flex min-w-0 flex-col gap-5">
            <StatusSummaryCard job={job} />
            <TaskDetailsCard job={job} />
          </aside>
        </div>
      ) : null}

      {job?.externalProviderKind === "crowdin" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <TaskCommentsSection
            comments={comments}
            isError={Boolean(commentsError)}
            isLoading={commentsLoading}
          />
          <TaskActivitySection job={job} />
        </div>
      ) : null}
    </main>
  );
}
