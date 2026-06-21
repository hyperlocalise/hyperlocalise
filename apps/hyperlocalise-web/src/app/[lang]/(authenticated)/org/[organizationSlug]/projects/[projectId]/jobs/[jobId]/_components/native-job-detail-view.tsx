"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft02Icon,
  AiMagicIcon,
  RefreshIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyH2 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { buildJobCatHref, canOpenJobCat } from "@/lib/projects/job-cat-routing";

import { toneClass } from "../../../../../_components/workspace-resource-shared";

import {
  buildJobsListHref,
  canMarkJobFailed,
  canRetryJob,
  canRunAgentOnNativeFileJob,
  formatJobDetailDate,
  formatJobDetailKind,
  isProviderBackedJob,
  jobDetailStatusTone,
  type JobDetailRecord,
} from "./job-detail-types";
import { JobAssigneeSection } from "./job-assignee-section";

export type JobDetailBackLinkRenderer = (props: { href: string; children: ReactNode }) => ReactNode;

export type JobDetailErrorRenderer = (props: { error: unknown }) => ReactNode;

export type JobDetailProviderSectionRenderer = (props: {
  job: JobDetailRecord & { externalProviderKind: string };
  jobId: string;
  organizationSlug: string;
  projectId: string | null;
}) => ReactNode;

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-foreground/8 bg-foreground/3.5 p-4 text-xs leading-6 text-foreground/72">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-foreground/42">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-foreground/74">{value ?? "—"}</dd>
    </div>
  );
}

export function defaultRenderBackLink({
  href,
  children,
}: Parameters<JobDetailBackLinkRenderer>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      variant="ghost"
      className="-ml-2 mb-2 text-foreground/54 hover:bg-foreground/6 hover:text-foreground"
    >
      <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.8} />
      {children}
    </Button>
  );
}

export function defaultRenderError({ error }: Parameters<JobDetailErrorRenderer>[0]) {
  return (
    <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
      {error instanceof Error ? error.message : "Unable to load job"}
    </div>
  );
}

export function NativeJobDetailView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  error,
  isLoading,
  isMarkFailedPending = false,
  isRetryPending = false,
  isRunAgentPending = false,
  job,
  jobId,
  markFailedDialogOpen: controlledMarkFailedDialogOpen,
  onMarkFailed,
  onMarkFailedDialogOpenChange,
  onRetry,
  onRunAgent,
  organizationSlug,
  projectId,
  renderBackLink = defaultRenderBackLink,
  renderError = defaultRenderError,
  renderProviderDetailSection,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  error?: unknown;
  isLoading: boolean;
  isMarkFailedPending?: boolean;
  isRetryPending?: boolean;
  isRunAgentPending?: boolean;
  job?: JobDetailRecord;
  jobId: string;
  markFailedDialogOpen?: boolean;
  onMarkFailed?: () => void;
  onMarkFailedDialogOpenChange?: (open: boolean) => void;
  onRetry?: () => void;
  onRunAgent?: () => void;
  organizationSlug: string;
  projectId: string;
  renderBackLink?: JobDetailBackLinkRenderer;
  renderError?: JobDetailErrorRenderer;
  renderProviderDetailSection?: JobDetailProviderSectionRenderer;
}) {
  const [uncontrolledMarkFailedDialogOpen, setUncontrolledMarkFailedDialogOpen] = useState(false);
  const markFailedDialogOpen = controlledMarkFailedDialogOpen ?? uncontrolledMarkFailedDialogOpen;
  const setMarkFailedDialogOpen =
    onMarkFailedDialogOpenChange ?? setUncontrolledMarkFailedDialogOpen;

  const showActions = job
    ? canRetryJob(job) || canMarkJobFailed(job) || canRunAgentOnNativeFileJob(job)
    : false;
  const catHref = job ? buildJobCatHref(organizationSlug, projectId, job) : null;
  const showCatAction = job ? canOpenJobCat(job) : false;
  const jobsListHref = buildJobsListHrefProp(organizationSlug, projectId);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {renderBackLink({ href: jobsListHref, children: "Jobs" })}
          <TypographyH1 className="wrap-break-word font-heading text-3xl font-semibold text-foreground md:text-4xl">
            {job?.externalTitle ?? job?.id ?? jobId}
          </TypographyH1>
        </div>
        {job ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Badge
              variant="outline"
              className={cn(
                "w-fit rounded-full capitalize",
                toneClass(jobDetailStatusTone(job.status)),
              )}
            >
              {job.status}
            </Badge>
            {showActions || showCatAction ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {showCatAction && catHref ? (
                  <Button size="sm" variant="outline" render={<Link href={catHref} />}>
                    <ListIcon />
                    CAT
                  </Button>
                ) : null}
                {canRunAgentOnNativeFileJob(job) && onRunAgent ? (
                  <Button
                    size="sm"
                    disabled={isRunAgentPending || isRetryPending || isMarkFailedPending}
                    onClick={onRunAgent}
                  >
                    <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />
                    {isRunAgentPending ? "Starting agent..." : "Translate with agent"}
                  </Button>
                ) : null}
                {canRetryJob(job) && onRetry ? (
                  <Button
                    size="sm"
                    disabled={isRetryPending || isMarkFailedPending}
                    onClick={onRetry}
                  >
                    <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
                    {isRetryPending ? "Retrying..." : "Retry job"}
                  </Button>
                ) : null}
                {canMarkJobFailed(job) && onMarkFailed ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isRetryPending || isMarkFailedPending}
                    onClick={() => setMarkFailedDialogOpen(true)}
                  >
                    <HugeiconsIcon icon={StopCircleIcon} strokeWidth={1.8} />
                    Mark as failed
                  </Button>
                ) : null}
              </div>
            ) : null}
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
        <>
          <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              Overview
            </TypographyH2>
            <dl className="mt-3 divide-y divide-foreground/8">
              <DetailRow label="Job ID" value={job.id} />
              <DetailRow label="Kind" value={formatJobDetailKind(job)} />
              <DetailRow
                label="Source"
                value={
                  isProviderBackedJob(job) ? `Provider · ${job.externalProviderKind}` : "Native"
                }
              />
              <DetailRow label="Project" value={job.projectName ?? job.projectId ?? "Workspace"} />
              <DetailRow label="Interaction" value={job.interactionId} />
              <DetailRow label="Workflow run" value={job.workflowRunId} />
              <DetailRow label="Created" value={formatJobDetailDate(job.createdAt)} />
              <DetailRow label="Updated" value={formatJobDetailDate(job.updatedAt)} />
              <DetailRow label="Completed" value={formatJobDetailDate(job.completedAt)} />
              <DetailRow label="Last error" value={job.lastError} />
            </dl>
          </section>

          <JobAssigneeSection canEdit job={job} jobId={jobId} organizationSlug={organizationSlug} />

          {isProviderBackedJob(job) && renderProviderDetailSection
            ? renderProviderDetailSection({
                job,
                jobId,
                organizationSlug,
                projectId: job.projectId,
              })
            : null}

          {job.kind === "review" || job.kind === "sync" || job.kind === "asset_management" ? (
            <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Kind Details
              </TypographyH2>
              <dl className="mt-3 divide-y divide-foreground/8">
                {job.kind === "review" ? (
                  <>
                    <DetailRow label="Criteria" value={job.reviewCriteria} />
                    <DetailRow label="Target locale" value={job.reviewTargetLocale} />
                  </>
                ) : null}
                {job.kind === "sync" ? (
                  <>
                    <DetailRow label="Connector" value={job.syncConnectorKind} />
                    <DetailRow label="Direction" value={job.syncDirection} />
                  </>
                ) : null}
                {job.kind === "asset_management" ? (
                  <>
                    <DetailRow label="Asset type" value={job.assetType} />
                    <DetailRow label="Operation" value={job.assetOperation} />
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Input
              </TypographyH2>
              <div className="mt-4">
                <JsonBlock value={job.inputPayload} />
              </div>
            </div>
            <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Output
              </TypographyH2>
              <div className="mt-4">
                <JsonBlock value={job.outcomePayload} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              Context Snapshot
            </TypographyH2>
            <div className="mt-4">
              <JsonBlock value={job.contextSnapshot} />
            </div>
          </section>
        </>
      ) : null}

      {onMarkFailed ? (
        <AlertDialog
          open={markFailedDialogOpen}
          onOpenChange={(open) => {
            if (!isMarkFailedPending) {
              setMarkFailedDialogOpen(open);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark job as failed?</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop the job from appearing queued or running and prevent the current
                workflow run from updating it later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isMarkFailedPending}>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={isMarkFailedPending} onClick={onMarkFailed}>
                <HugeiconsIcon icon={StopCircleIcon} strokeWidth={1.8} />
                {isMarkFailedPending ? "Marking..." : "Mark failed"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </main>
  );
}
