"use client";

import Link from "next/link";
import {
  ArrowLeft02Icon,
  Clock01Icon,
  File01Icon,
  LanguageSquareIcon,
  LinkSquare02Icon,
  RefreshIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1, TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import type {
  TmsProviderLiveJobComment,
  TmsProviderLiveJobDetail,
} from "@/lib/providers/tms-provider-live";

import { toneClass } from "../../../../../_components/workspace-resource-shared";
import { JobDetailRow } from "../../../../../jobs/_components/provider-crowdin-job-detail-rows";
import { ProviderJobDescriptionField } from "../../../../../jobs/_components/provider-job-description-field";
import { TmsLiveJobFilesSection } from "./tms/tms-live-job-files-section";
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

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
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

function TaskDescriptionSection({
  canEditProviderJobDescription,
  description,
  job,
  jobQueryKey,
  organizationSlug,
}: {
  canEditProviderJobDescription: boolean;
  description: string;
  job: TmsProviderLiveJobDetail;
  jobQueryKey: readonly unknown[];
  organizationSlug: string;
}) {
  const canEditProviderDescription = job.id.startsWith("ext:");

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Task description
      </TypographyH2>
      <div className="mt-4">
        <ProviderJobDescriptionField
          organizationSlug={organizationSlug}
          encodedJobId={job.id}
          description={description}
          editable={canEditProviderJobDescription && canEditProviderDescription}
          queryKey={jobQueryKey}
        />
      </div>
    </section>
  );
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
        <JobDetailRow label="Due date" value={formatDate(job.externalDueDate)} />
        <JobDetailRow label="Last sync" value={formatDate(job.updatedAt)} />
        {wordsToDo ? <JobDetailRow label="Words to do" value={wordsToDo} /> : null}
        <JobDetailRow label="External job ID" value={job.externalJobId} />
        <JobDetailRow label="External task ID" value={job.id} />
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
                    {formatDate(comment.createdAt)}
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
            <span className="text-xs text-foreground/42">{formatDate(job.updatedAt)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground/58">
            Latest provider status is {job.status}.
          </p>
        </li>
      </ul>
    </section>
  );
}

export function ProviderLiveJobDetailContent({
  jobId,
  organizationSlug,
  projectId,
  canEditProviderJobDescription,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
  canEditProviderJobDescription: boolean;
}) {
  const queryClient = useQueryClient();
  const jobQueryKey = ["tms-provider-job", organizationSlug, jobId] as const;
  const commentsQueryKey = ["tms-provider-job-comments", organizationSlug, jobId] as const;
  const jobQuery = useQuery({
    queryKey: jobQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$get({
        param: { organizationSlug, encodedJobId: jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load provider job (${response.status})`);
      }

      const body = (await response.json()) as { job: TmsProviderLiveJobDetail };
      return body.job;
    },
  });
  const commentsQuery = useQuery({
    queryKey: commentsQueryKey,
    enabled: jobQuery.data?.externalProviderKind === "crowdin",
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].comments.$get({
        param: { organizationSlug, encodedJobId: jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load task comments (${response.status})`);
      }

      const body = (await response.json()) as { comments: TmsProviderLiveJobComment[] };
      return body.comments;
    },
  });

  const job = jobQuery.data;
  const providerDescription = job
    ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
    : "";
  const canEditProviderDescription = Boolean(
    job && canEditProviderJobDescription && job.id.startsWith("ext:"),
  );
  const showTaskDescriptionSection =
    providerDescription.trim().length > 0 || canEditProviderDescription;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button
            nativeButton={false}
            render={
              <Link
                href={`/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs`}
              />
            }
            variant="ghost"
            className="-ml-2 mb-2 text-foreground/54 hover:bg-foreground/6 hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.8} />
            Jobs
          </Button>
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
              <MetricItem icon={Clock01Icon} label={`Last synced ${formatDate(job.updatedAt)}`} />
            </div>
          ) : null}
        </div>
        {job ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {job.externalUrl ? (
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
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={jobQuery.isFetching}
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: jobQueryKey });
                }}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
                {jobQuery.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
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

      {jobQuery.isLoading ? (
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      ) : null}

      {jobQuery.isError ? (
        <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
          {jobQuery.error instanceof Error ? jobQuery.error.message : "Unable to load provider job"}
        </div>
      ) : null}

      {job ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {showTaskDescriptionSection ? (
              <TaskDescriptionSection
                canEditProviderJobDescription={canEditProviderJobDescription}
                description={providerDescription}
                job={job}
                jobQueryKey={jobQueryKey}
                organizationSlug={organizationSlug}
              />
            ) : null}

            {job.externalProviderKind === "crowdin" ? (
              <TmsLiveJobFilesSection
                organizationSlug={organizationSlug}
                projectId={projectId}
                encodedJobId={jobId}
                highlightLocale={
                  typeof job.externalProviderPayload.languageId === "string"
                    ? job.externalProviderPayload.languageId
                    : null
                }
              />
            ) : null}
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
            comments={commentsQuery.data ?? []}
            isError={commentsQuery.isError}
            isLoading={commentsQuery.isLoading}
          />
          <TaskActivitySection job={job} />
        </div>
      ) : null}
    </main>
  );
}
