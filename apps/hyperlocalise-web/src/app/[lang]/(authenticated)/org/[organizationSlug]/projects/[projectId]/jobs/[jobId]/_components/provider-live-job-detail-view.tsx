"use client";

import { useState, type ReactNode } from "react";
import {
  AiMagicIcon,
  ArrowDown01Icon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1, TypographyH4 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import type {
  TmsProviderLiveJobComment,
  TmsProviderLiveJobDetail,
} from "@/lib/providers/tms-provider-live";

import { toneClass } from "../../../../../_components/workspace-resource-shared";
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
} from "../../../../../jobs/_components/provider-crowdin-job-display";

import {
  buildJobsListHref,
  formatJobDetailDate,
  type ProviderActionAvailability,
} from "./job-detail-types";
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
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={1.8}
        className="size-4 shrink-0 text-muted-foreground"
      />
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

function CompactPropertyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm leading-5 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function TaskDetailsCard({ job }: { job: TmsProviderLiveJobDetail }) {
  const [showMore, setShowMore] = useState(false);
  const readiness = getCrowdinLocaleReadiness(job.externalProviderPayload);
  const hasReadiness = readiness !== null;
  const progress = hasReadiness ? getProgressValue(job) : null;
  const progressLabel =
    hasReadiness && progress !== null
      ? (formatReadinessProgress(readiness) ?? `${progress}% translated`)
      : null;
  const providerName = formatProviderKind(job.externalProviderKind);
  const targetLocales = formatLocaleList(
    getCrowdinTargetLocales(job.externalProviderPayload, job.externalTargetLocales),
  );
  const taskType = getCrowdinTaskTypeLabel(job.externalProviderPayload) ?? formatJobKind(job);
  const wordsToDo = formatWordsToDo(getCrowdinLocaleReadiness(job.externalProviderPayload));

  return (
    <section className="rounded-lg border border-border bg-card p-5 xl:sticky xl:top-5">
      <div className="flex items-center justify-between gap-3">
        <TypographyH4>Properties</TypographyH4>
      </div>
      <Collapsible open={showMore} onOpenChange={setShowMore}>
        <dl className="mt-5">
          <CompactPropertyRow
            label="Status"
            value={
              <Badge
                variant="outline"
                className={cn("rounded-full capitalize", toneClass(statusTone(job.status)))}
              >
                {job.status}
              </Badge>
            }
          />
          <CompactPropertyRow
            label="Progress"
            value={progressLabel ?? `Provider status: ${job.externalStatus || job.status}`}
          />
          <CompactPropertyRow label="Provider" value={providerName} />
          <CompactPropertyRow label="Task type" value={taskType} />
          <CompactPropertyRow label="Target locales" value={targetLocales} />
          <CompactPropertyRow
            label="Assignees"
            value={
              job.externalAssignedUsers.length > 0 ? job.externalAssignedUsers.join(", ") : "—"
            }
          />
          <CompactPropertyRow label="Due date" value={formatJobDetailDate(job.externalDueDate)} />
          {wordsToDo ? <CompactPropertyRow label="Words to do" value={wordsToDo} /> : null}
          <CollapsibleContent>
            <CompactPropertyRow label="Project" value={job.projectName ?? job.projectId} />
            <CompactPropertyRow
              label="Language"
              value={getCrowdinLanguageLabel(job.externalProviderPayload) ?? "—"}
            />
            <CompactPropertyRow label="Last sync" value={formatJobDetailDate(job.updatedAt)} />
            <CompactPropertyRow label="External job ID" value={job.externalJobId} />
            <CompactPropertyRow label="External task ID" value={job.externalTaskId} />
          </CollapsibleContent>
        </dl>
        <CollapsibleTrigger
          className="mt-3 inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:text-foreground"
          aria-label={
            showMore ? "Hide secondary task properties" : "Show secondary task properties"
          }
        >
          {showMore ? "Show less" : "Show more"}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={1.8}
            className={cn("size-4 transition-transform", showMore && "rotate-180")}
          />
        </CollapsibleTrigger>
      </Collapsible>
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
    <section>
      <TypographyH4>Comments</TypographyH4>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">Unable to load task comments.</p>
      ) : null}

      {!isLoading && !isError && comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No comments yet.</p>
      ) : null}

      {!isLoading && !isError && comments.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
          {comments.map((comment) => {
            const timeSpent = formatTimeSpent(comment.timeSpentSeconds);

            return (
              <li key={comment.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">User {comment.userId}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatJobDetailDate(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {comment.text}
                </p>
                {timeSpent ? (
                  <p className="mt-2 text-xs text-muted-foreground">Time spent: {timeSpent}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
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
  isTranslateWithAgentPending = false,
  job,
  jobId,
  onRefresh,
  onTranslateWithAgent,
  organizationSlug,
  projectId,
  renderBackLink = defaultRenderBackLink,
  renderDescriptionField,
  renderError = defaultRenderError,
  renderExternalLink,
  renderFilesSection,
  translateWithAgentAction,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  canEditProviderJobDescription?: boolean;
  comments?: TmsProviderLiveJobComment[];
  commentsError?: unknown;
  commentsLoading?: boolean;
  error?: unknown;
  isLoading: boolean;
  isRefreshing?: boolean;
  isTranslateWithAgentPending?: boolean;
  job?: TmsProviderLiveJobDetail;
  jobId: string;
  onRefresh?: () => void;
  onTranslateWithAgent?: () => void;
  organizationSlug: string;
  projectId: string;
  renderBackLink?: JobDetailBackLinkRenderer;
  renderDescriptionField?: ProviderLiveDescriptionFieldRenderer;
  renderError?: JobDetailErrorRenderer;
  renderExternalLink?: (props: { href: string; label: string }) => ReactNode;
  renderFilesSection?: ProviderLiveFilesSectionRenderer;
  translateWithAgentAction?: ProviderActionAvailability | null;
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
  const showTranslateWithAgent = translateWithAgentAction?.visible ?? false;
  const translateWithAgentDisabled =
    !translateWithAgentAction?.enabled || isTranslateWithAgentPending || !onTranslateWithAgent;
  const translateWithAgentLabel = isTranslateWithAgentPending
    ? "Starting agent..."
    : (translateWithAgentAction?.label ?? "Translate with agent");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {renderBackLink({ href: jobsListHref, children: "Jobs" })}
          <TypographyH1>{job?.externalTitle ?? jobId}</TypographyH1>
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
              {showTranslateWithAgent ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="sm"
                        disabled={translateWithAgentDisabled}
                        onClick={onTranslateWithAgent}
                      >
                        <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />
                        {translateWithAgentLabel}
                      </Button>
                    }
                  />
                  {translateWithAgentAction?.disabledReason ? (
                    <TooltipContent>{translateWithAgentAction.disabledReason}</TooltipContent>
                  ) : null}
                </Tooltip>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      ) : null}

      {error ? renderError({ error }) : null}

      {job ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {showTaskDescriptionSection && renderDescriptionField ? (
              <section>
                <TypographyH4>Description</TypographyH4>
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

            {job.externalProviderKind === "crowdin" ? (
              <TaskCommentsSection
                comments={comments}
                isError={Boolean(commentsError)}
                isLoading={commentsLoading}
              />
            ) : null}
          </div>
          <aside className="flex min-w-0 flex-col gap-5">
            <TaskDetailsCard job={job} />
          </aside>
        </div>
      ) : null}
    </main>
  );
}
