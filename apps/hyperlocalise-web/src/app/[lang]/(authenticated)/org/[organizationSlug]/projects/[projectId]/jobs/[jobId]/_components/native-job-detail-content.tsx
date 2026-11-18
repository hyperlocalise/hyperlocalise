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
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListBulletsIcon,
  ArrowSquareOutIcon,
  ArrowClockwiseIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  ProhibitIcon,
  StopCircleIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { TaskReport } from "@/components/reports/task-report";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { apiClient } from "@/lib/api-client-instance";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  buildJobContentEditorHref,
  canOpenJobContentEditor,
} from "@/lib/projects/job-content-editor-routing";
import {
  readJobFailureDetails,
  shouldShowJobFailureDetails,
} from "@/lib/projects/jobs/job-failure-details";

import { getProviderPayloadString } from "../../../../../jobs/_components/provider-crowdin-job-display";
import { buildJobDetailHref } from "../../../../../jobs/_components/jobs-view-helpers";

import { isJobStatusActive } from "./build-job-activity";
import {
  hasJobActivityFeed,
  JOB_ACTIVITY_POLL_INTERVAL_MS,
  JobActivitySection,
} from "./job-activity-section";
import { NativeJobOwnerField } from "./job-detail-assignee-field";
import { JobDetailEditableTitle } from "./job-detail-editable-title";
import {
  getInputPayloadMetadataDescription,
  jobDetailTaskLayoutFromRecord,
  shortJobTitle,
} from "./job-detail-layout-helpers";
import { JobDetailTaskView } from "./job-detail-task-view";
import type { JobDetailRecord } from "./job-detail-types";
import { JobFailureNotice } from "./job-failure-notice";
import { JobProviderDetailSection } from "./job-provider-detail-section";
import { NativeJobDescriptionField } from "./native-job-description-field";
import { JobComesAfterField } from "./job-comes-after-field";
import { jobComesAfterFieldMessages } from "./job-comes-after-field.messages";
import { NativeJobDueDateField } from "./native-job-due-date-field";
import {
  isNativeFileTranslationJob,
  NativeJobSourceFilesSection,
} from "./native-job-detail-helpers";
import { reportsQueryKey } from "@/components/reports/reports-queries";
import { isWaitingTask } from "@/lib/projects/jobs/person-task";
import { nativeJobDetailContentMessages as messages } from "./native-job-detail-content.messages";
import {
  canCancelJob,
  canMarkJobFailed,
  canMarkTaskDone,
  canRetryJob,
  isProviderBackedJob,
} from "./job-detail-types";

async function parseActionError(response: Response, fallback: string) {
  let error: string | undefined;

  try {
    const body = (await response.json()) as { error?: string };
    error = body.error;
  } catch {
    error = undefined;
  }

  return error ? `${fallback}: ${error}` : `${fallback} (${response.status})`;
}

/** The task behind a task owner's page is finished, cancelled or was given to someone else. */
class TaskNoLongerOpenError extends Error {}

export function NativeJobDetailContent({
  jobId,
  organizationSlug,
  projectId,
  canEditJobFields = false,
  canMarkAnyTaskDone = false,
  taskOwnerOnly = false,
  canMarkOwnTaskDone = false,
  currentUserId,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
  canEditJobFields?: boolean;
  /** Reviewers and managers may finish any proofread task; others only their own. */
  canMarkAnyTaskDone?: boolean;
  /**
   * The person is here only through a task they own, not the project's team: a vendor, or a
   * member given a task outside their teams. They get the task's details, Open Editor and Mark
   * done. The page's other controls all go through the team, so they are not offered.
   */
  taskOwnerOnly?: boolean;
  /** Whether a task owner may finish their own task: a vendor, or a role that works on jobs. */
  canMarkOwnTaskDone?: boolean;
  currentUserId?: string;
}) {
  const [markFailedDialogOpen, setMarkFailedDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [markDoneDialogOpen, setMarkDoneDialogOpen] = useState(false);
  const intl = useIntl();
  const { client: goSvcClient } = useGoSvcClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;
  const jobQueryKey = ["job", organizationSlug, projectId, jobId] as const;

  const jobQuery = useQuery({
    queryKey: jobQueryKey,
    queryFn: async () => {
      try {
        const body = await goSvcClient.job.get<JobDetailRecord>(organizationSlug, jobId);
        if (body.job.projectId !== projectId) {
          throw new Error(intl.formatMessage(messages.jobWrongProject));
        }
        return body.job;
      } catch (error) {
        if (!(error instanceof GoSvcClientError) || error.status !== 404) {
          throw error;
        }
        if (taskOwnerOnly) {
          // A task owner's page ends with the task: finished, cancelled or given to someone else.
          throw new TaskNoLongerOpenError(intl.formatMessage(messages.taskNoLongerYours), {
            cause: error,
          });
        }
      }
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.failedToLoadJob, { status: response.status }));
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      if (body.job.projectId !== projectId) {
        throw new Error(intl.formatMessage(messages.jobWrongProject));
      }
      return body.job;
    },
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && hasJobActivityFeed(current) && isJobStatusActive(current.status)
        ? JOB_ACTIVITY_POLL_INTERVAL_MS
        : false;
    },
  });

  const retryJob = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].retry.$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToRetryJob)),
        );
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success(intl.formatMessage(messages.jobQueuedForRetry));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToRetryJob),
      );
    },
  });

  const markJobFailed = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "mark-failed"
      ].$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToMarkJobFailed)),
        );
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      setMarkFailedDialogOpen(false);
      toast.success(intl.formatMessage(messages.jobMarkedAsFailed));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToMarkJobFailed),
      );
    },
  });

  const cancelJob = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].cancel.$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToCancelJob)),
        );
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      setCancelDialogOpen(false);
      toast.success(intl.formatMessage(messages.jobCancelled));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToCancelJob),
      );
    },
  });

  const markTaskDone = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "mark-done"
      ].$post({
        param: { organizationSlug, jobId },
      });

      if (response.status === 409) {
        throw new Error(intl.formatMessage(messages.taskAlreadyClosed));
      }
      if (response.status === 403) {
        throw new Error(intl.formatMessage(messages.taskNotAssignedToYou));
      }
      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToMarkTaskDone)),
        );
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      if (taskOwnerOnly) {
        // The finished task is no longer theirs to open, so the page ends here.
        setMarkDoneDialogOpen(false);
        toast.success(intl.formatMessage(messages.taskMarkedDone));
        await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
        router.replace(myJobsHref);
        return;
      }
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      setMarkDoneDialogOpen(false);
      // The task's Report tab shows its fee and pricing lock, which marking done changes.
      await queryClient.invalidateQueries({ queryKey: reportsQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(messages.taskMarkedDone));
    },
    onError: async (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToMarkTaskDone),
      );
      // Someone else may have finished or cancelled the task meanwhile.
      setMarkDoneDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: jobQueryKey });
    },
  });

  const taskNoLongerOpen = jobQuery.error instanceof TaskNoLongerOpenError;
  useEffect(() => {
    if (taskNoLongerOpen) {
      toast.info(intl.formatMessage(messages.taskNoLongerYours));
      router.replace(myJobsHref);
    }
  }, [intl, myJobsHref, router, taskNoLongerOpen]);

  const job = jobQuery.data;
  const layout = job ? jobDetailTaskLayoutFromRecord(job, intl) : null;
  const jobActionPending =
    retryJob.isPending || markJobFailed.isPending || cancelJob.isPending || markTaskDone.isPending;
  const failureDetails = job ? readJobFailureDetails(job) : null;
  // Any failed job that a person did not own explains itself, whether or not an
  // agent was formally assigned; partial agent runs list their unfinished locales.
  const showFailureNotice = Boolean(
    job &&
    failureDetails &&
    ((job.status === "failed" && job.assigneeType !== "user") ||
      shouldShowJobFailureDetails(job, failureDetails)),
  );
  const followUpHref =
    job && failureDetails?.followUpJobId
      ? buildJobDetailHref(organizationSlug, projectId, failureDetails.followUpJobId)
      : null;
  const contentEditorHref = job
    ? buildJobContentEditorHref(organizationSlug, projectId, job)
    : null;
  const showCatAction = job ? canOpenJobContentEditor(job) : false;
  const isProviderBacked = Boolean(job && isProviderBackedJob(job));
  const isNativeEditable = Boolean(job && canEditJobFields && !isProviderBacked);
  const description = job
    ? isProviderBacked
      ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
      : getInputPayloadMetadataDescription(job)
    : "";

  const saveTitle = useMutation({
    mutationFn: async (nextTitle: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$patch({
        param: { organizationSlug, jobId },
        json: { title: nextTitle },
      });
      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToUpdateJob)),
        );
      }
      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
    },
  });

  const propertyEditDisabled = jobActionPending || saveTitle.isPending;
  const editableProperties = (layout?.properties ?? []).map((property) => {
    // A task owner cannot read the member list, and the task is their own.
    if (
      taskOwnerOnly &&
      property.id === "assignees" &&
      job?.ownerUserId &&
      job.ownerUserId === currentUserId
    ) {
      return { ...property, value: intl.formatMessage(messages.taskOwnerIsYou) };
    }
    if (!isNativeEditable || !job) {
      return property;
    }
    if (property.id === "due-date") {
      return {
        ...property,
        value: (
          <NativeJobDueDateField
            organizationSlug={organizationSlug}
            jobId={jobId}
            dueAt={job.dueAt}
            queryKey={jobQueryKey}
            disabled={propertyEditDisabled}
          />
        ),
      };
    }
    if (property.id !== "assignees") {
      return property;
    }
    return {
      ...property,
      value: (
        <NativeJobOwnerField
          organizationSlug={organizationSlug}
          projectId={projectId}
          jobId={jobId}
          ownerUserId={job.ownerUserId}
          assigneeType={job.assigneeType}
          queryKey={jobQueryKey}
          disabled={propertyEditDisabled}
        />
      ),
    };
  });
  const properties = job?.afterJobId
    ? [
        ...editableProperties,
        {
          id: "comes-after",
          label: intl.formatMessage(jobComesAfterFieldMessages.label),
          value: (
            <JobComesAfterField
              organizationSlug={organizationSlug}
              projectId={projectId}
              afterJobId={job.afterJobId}
              waiting={isWaitingTask(job)}
              linkOnlyWhenReadable={taskOwnerOnly}
            />
          ),
        },
      ]
    : editableProperties;

  useAppShellBreadcrumbAppend({
    id: "job-detail",
    label: layout ? shortJobTitle(layout.title) : undefined,
  });

  const isFailed = job?.status === "failed";
  // A task owner outside the project's team gets Mark done and the editor, nothing else.
  const showRetry = Boolean(job && !taskOwnerOnly && canRetryJob(job));
  const showCancel = Boolean(job && !taskOwnerOnly && canCancelJob(job));
  const showMarkFailed = Boolean(job && !taskOwnerOnly && canMarkJobFailed(job));
  // A failed job's notice carries Retry next to the reason; the header keeps it otherwise.
  const retryInNotice = isFailed && showRetry && showFailureNotice;
  const retryInHeader = showRetry && !retryInNotice;
  const retryButton = (
    <Button
      size="sm"
      variant={isFailed ? "default" : "outline"}
      disabled={jobActionPending}
      onClick={() => retryJob.mutate()}
    >
      <ArrowClockwiseIcon />
      {retryJob.isPending ? (
        <FormattedMessage {...messages.retrying} />
      ) : (
        <FormattedMessage {...messages.retryJob} />
      )}
    </Button>
  );

  // One filled button per status: Retry on a failed job, the editor otherwise.
  // Destructive and rare actions sit in the overflow menu.
  const headerActions = job ? (
    <>
      {job.externalUrl ? (
        <Button
          nativeButton={false}
          render={
            <a href={job.externalUrl} target="_blank" rel="noreferrer noopener">
              <ArrowSquareOutIcon />
              <FormattedMessage
                {...messages.openInProvider}
                values={{ providerKind: job.externalProviderKind }}
              />
            </a>
          }
          size="sm"
          variant="outline"
        />
      ) : null}
      {(canEditJobFields || (taskOwnerOnly && canMarkOwnTaskDone)) &&
      canMarkTaskDone(job) &&
      (canMarkAnyTaskDone || (currentUserId !== undefined && job.ownerUserId === currentUserId)) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={jobActionPending}
          onClick={() => setMarkDoneDialogOpen(true)}
        >
          <CheckCircleIcon />
          <FormattedMessage {...messages.markTaskDone} />
        </Button>
      ) : null}
      {showCatAction && contentEditorHref ? (
        <Button
          size="sm"
          variant={isFailed && retryInHeader ? "outline" : "default"}
          nativeButton={false}
          render={<Link href={contentEditorHref} />}
        >
          <ListBulletsIcon />
          <FormattedMessage {...messages.openEditor} />
        </Button>
      ) : null}
      {retryInHeader ? retryButton : null}
      {showCancel || showMarkFailed ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={jobActionPending}
                aria-label={intl.formatMessage(messages.moreActions)}
              />
            }
          >
            <DotsThreeIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {showCancel ? (
              <DropdownMenuItem onClick={() => setCancelDialogOpen(true)}>
                <ProhibitIcon />
                <FormattedMessage {...messages.cancelJob} />
              </DropdownMenuItem>
            ) : null}
            {showMarkFailed ? (
              <DropdownMenuItem variant="destructive" onClick={() => setMarkFailedDialogOpen(true)}>
                <StopCircleIcon />
                <FormattedMessage {...messages.markAsFailed} />
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <JobDetailTaskView
        jobId={jobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        title={
          <JobDetailEditableTitle
            title={layout?.title ?? jobId}
            editable={isNativeEditable}
            disabled={jobActionPending || saveTitle.isPending}
            onSave={async (nextTitle) => {
              await saveTitle.mutateAsync(nextTitle);
            }}
          />
        }
        metrics={layout?.metrics ?? []}
        properties={properties}
        secondaryProperties={layout?.secondaryProperties ?? []}
        headerActions={headerActions}
        isLoading={jobQuery.isLoading || taskNoLongerOpen}
        error={jobQuery.isError ? jobQuery.error : undefined}
        description={description}
        canEditDescription={isNativeEditable}
        renderDescriptionField={
          isNativeEditable
            ? ({ description: fieldDescription, editable, startEditing, onCancel }) => (
                <NativeJobDescriptionField
                  organizationSlug={organizationSlug}
                  jobId={jobId}
                  description={fieldDescription}
                  editable={editable}
                  queryKey={jobQueryKey}
                  startEditing={startEditing}
                  onCancel={onCancel}
                />
              )
            : description.trim().length > 0
              ? ({ description: fieldDescription }) => (
                  <MarkdownPreview value={fieldDescription} className="border-border bg-card" />
                )
              : undefined
        }
        renderFilesSection={
          job && isNativeFileTranslationJob(job)
            ? () => (
                <NativeJobSourceFilesSection
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  job={job}
                  // A task owner's editor opens with the task, not while it waits.
                  canOpenEditor={!(taskOwnerOnly && isWaitingTask(job))}
                />
              )
            : undefined
        }
        renderReportSection={
          job && !isProviderBackedJob(job) && !taskOwnerOnly
            ? () => (
                <TaskReport
                  organizationSlug={organizationSlug}
                  jobId={jobId}
                  defaultStep={job.kind === "proofread" ? "review" : "translation"}
                />
              )
            : undefined
        }
        renderExtraMain={
          showFailureNotice ||
          (job && (isProviderBackedJob(job) || (!taskOwnerOnly && hasJobActivityFeed(job))))
            ? () => (
                <>
                  {showFailureNotice && failureDetails ? (
                    <JobFailureNotice
                      details={failureDetails}
                      followUpHref={followUpHref}
                      variant={job?.status === "failed" ? "failed" : "partial"}
                      action={retryInNotice ? retryButton : null}
                    />
                  ) : null}
                  {job && !taskOwnerOnly && hasJobActivityFeed(job) ? (
                    <JobActivitySection
                      organizationSlug={organizationSlug}
                      projectId={projectId}
                      job={job}
                    />
                  ) : null}
                  {job && isProviderBackedJob(job) ? (
                    <JobProviderDetailSection
                      job={job}
                      jobId={jobId}
                      organizationSlug={organizationSlug}
                      projectId={projectId}
                      showProviderMetadata={false}
                      showAgentActions={false}
                    />
                  ) : null}
                </>
              )
            : undefined
        }
      />

      <AlertDialog
        open={markFailedDialogOpen}
        onOpenChange={(open) => {
          if (!markJobFailed.isPending) {
            setMarkFailedDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.markFailedTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.markFailedDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markJobFailed.isPending}>
              <FormattedMessage {...messages.cancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={markJobFailed.isPending}
              onClick={() => markJobFailed.mutate()}
            >
              <StopCircleIcon />
              {markJobFailed.isPending ? (
                <FormattedMessage {...messages.marking} />
              ) : (
                <FormattedMessage {...messages.markFailedConfirm} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={markDoneDialogOpen}
        onOpenChange={(open) => {
          if (!markTaskDone.isPending) {
            setMarkDoneDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.markTaskDoneTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.markTaskDoneDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markTaskDone.isPending}>
              <FormattedMessage {...messages.keepTaskOpen} />
            </AlertDialogCancel>
            <Button disabled={markTaskDone.isPending} onClick={() => markTaskDone.mutate()}>
              {markTaskDone.isPending ? (
                <FormattedMessage {...messages.markingTaskDone} />
              ) : (
                <FormattedMessage {...messages.markTaskDone} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!cancelJob.isPending) {
            setCancelDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.cancelJobTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.cancelJobDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelJob.isPending}>
              <FormattedMessage {...messages.keepJob} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelJob.isPending}
              onClick={() => cancelJob.mutate()}
            >
              {cancelJob.isPending ? (
                <FormattedMessage {...messages.cancelling} />
              ) : (
                <FormattedMessage {...messages.cancelJob} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
