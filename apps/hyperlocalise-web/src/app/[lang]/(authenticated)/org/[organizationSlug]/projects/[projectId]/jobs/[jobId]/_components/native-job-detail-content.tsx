"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AiMagicIcon,
  LinkSquare02Icon,
  RefreshIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";
import { toast } from "sonner";

import { MarkdownDescriptionPreview } from "@/components/markdown-description-editor/markdown-description-editor";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { apiClient } from "@/lib/api-client-instance";
import { buildJobCatHref, canOpenJobCat } from "@/lib/projects/job-cat-routing";

import { getProviderPayloadString } from "../../../../../jobs/_components/provider-crowdin-job-display";

import { jobDetailTaskLayoutFromRecord } from "./job-detail-layout-helpers";
import { JobDetailTaskView } from "./job-detail-task-view";
import type { JobDetailRecord } from "./job-detail-types";
import { JobProviderDetailSection } from "./job-provider-detail-section";
import {
  isNativeFileTranslationJob,
  NativeJobSourceFilesSection,
} from "./native-job-detail-helpers";
import {
  canMarkJobFailed,
  canRetryJob,
  canRunAgentOnNativeFileJob,
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

function providerTranslateAction(job: JobDetailRecord) {
  return (job.providerActions ?? []).find((action) => action.id === "translate_with_agent") ?? null;
}

export function NativeJobDetailContent({
  jobId,
  organizationSlug,
  projectId,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) {
  const [markFailedDialogOpen, setMarkFailedDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const jobQueryKey = ["job", organizationSlug, projectId, jobId] as const;

  const jobQuery = useQuery({
    queryKey: jobQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load job (${response.status})`);
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      if (body.job.projectId !== projectId) {
        throw new Error("Job does not belong to this project");
      }
      return body.job;
    },
  });

  const runAgentJob = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "run-agent"
      ].$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to start agent on job"));
      }

      await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jobQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success("Translation agent is running");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start agent on job");
    },
  });

  const retryJob = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].retry.$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to retry job"));
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success("Job queued for retry");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry job");
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
        throw new Error(await parseActionError(response, "Failed to mark job as failed"));
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      setMarkFailedDialogOpen(false);
      toast.success("Job marked as failed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark job as failed");
    },
  });

  const job = jobQuery.data;
  const layout = job ? jobDetailTaskLayoutFromRecord(job) : null;
  const catHref = job ? buildJobCatHref(organizationSlug, projectId, job) : null;
  const showCatAction = job ? canOpenJobCat(job) : false;
  const providerDescription =
    job && isProviderBackedJob(job)
      ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
      : "";
  const translateAction = job && isProviderBackedJob(job) ? providerTranslateAction(job) : null;
  useAppShellBreadcrumbAppend({
    id: "job-detail",
    label: layout?.title,
  });

  const headerActions = job ? (
    <>
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
      {showCatAction && catHref ? (
        <Button size="sm" variant="outline" render={<Link href={catHref} />}>
          <ListIcon />
          View strings
        </Button>
      ) : null}
      {translateAction?.visible ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                disabled={
                  !translateAction.enabled ||
                  runAgentJob.isPending ||
                  retryJob.isPending ||
                  markJobFailed.isPending
                }
                onClick={() => runAgentJob.mutate()}
              >
                <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />
                {runAgentJob.isPending ? "Starting agent..." : translateAction.label}
              </Button>
            }
          />
          {translateAction.disabledReason ? (
            <TooltipContent>{translateAction.disabledReason}</TooltipContent>
          ) : null}
        </Tooltip>
      ) : canRunAgentOnNativeFileJob(job) ? (
        <Button
          size="sm"
          disabled={runAgentJob.isPending || retryJob.isPending || markJobFailed.isPending}
          onClick={() => runAgentJob.mutate()}
        >
          <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />
          {runAgentJob.isPending ? "Starting agent..." : "Translate with agent"}
        </Button>
      ) : null}
      {canRetryJob(job) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={retryJob.isPending || markJobFailed.isPending}
          onClick={() => retryJob.mutate()}
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          {retryJob.isPending ? "Retrying..." : "Retry job"}
        </Button>
      ) : null}
      {canMarkJobFailed(job) ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={retryJob.isPending || markJobFailed.isPending}
          onClick={() => setMarkFailedDialogOpen(true)}
        >
          <HugeiconsIcon icon={StopCircleIcon} strokeWidth={1.8} />
          Mark as failed
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <JobDetailTaskView
        jobId={jobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        title={layout?.title}
        metrics={layout?.metrics ?? []}
        properties={layout?.properties ?? []}
        secondaryProperties={layout?.secondaryProperties ?? []}
        headerActions={headerActions}
        isLoading={jobQuery.isLoading}
        error={jobQuery.isError ? jobQuery.error : undefined}
        description={providerDescription}
        renderDescriptionField={
          providerDescription.trim().length > 0
            ? ({ description }) => (
                <MarkdownDescriptionPreview value={description} className="border-border bg-card" />
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
                />
              )
            : undefined
        }
        renderExtraMain={
          job && isProviderBackedJob(job)
            ? () => (
                <JobProviderDetailSection
                  job={job}
                  jobId={jobId}
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  showProviderMetadata={false}
                  showAgentActions={false}
                />
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
            <AlertDialogTitle>Mark job as failed?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the job from appearing queued or running and prevent the current
              workflow run from updating it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markJobFailed.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={markJobFailed.isPending}
              onClick={() => markJobFailed.mutate()}
            >
              <HugeiconsIcon icon={StopCircleIcon} strokeWidth={1.8} />
              {markJobFailed.isPending ? "Marking..." : "Mark failed"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
