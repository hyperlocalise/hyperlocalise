"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { isTmsProviderShellModeEnabled } from "@/lib/providers/tms-provider-shell-mode";
import { parseProviderJobId } from "@/lib/providers/tms-provider-resource-id";

import { useActiveTmsProvider } from "../../../../../_hooks/use-active-tms-provider";

import type { JobDetailRecord } from "./job-detail-types";
import { JobProviderDetailSection } from "./job-provider-detail-section";
import { NativeJobDetailView } from "./native-job-detail-view";
import { ProviderLiveJobDetailContent } from "./provider-live-job-detail-content";

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

export function JobDetailPageContent({
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
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const encodedProviderJob = parseProviderJobId(jobId);
  const useLiveProviderJob =
    isTmsProviderShellModeEnabled() &&
    Boolean(activeTmsProviderQuery.data) &&
    encodedProviderJob?.providerKind === activeTmsProviderQuery.data?.providerKind;

  if (encodedProviderJob && activeTmsProviderQuery.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      </main>
    );
  }

  if (useLiveProviderJob) {
    return (
      <ProviderLiveJobDetailContent
        jobId={jobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        canEditProviderJobDescription={canEditProviderJobDescription}
      />
    );
  }

  return (
    <NativeJobDetailPageContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
    />
  );
}

function NativeJobDetailPageContent({
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

  return (
    <NativeJobDetailView
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      job={jobQuery.data}
      isLoading={jobQuery.isLoading}
      error={jobQuery.isError ? jobQuery.error : undefined}
      isRetryPending={retryJob.isPending}
      isMarkFailedPending={markJobFailed.isPending}
      markFailedDialogOpen={markFailedDialogOpen}
      onMarkFailedDialogOpenChange={setMarkFailedDialogOpen}
      onRetry={() => retryJob.mutate()}
      onMarkFailed={() => markJobFailed.mutate()}
      renderProviderDetailSection={(props) => (
        <JobProviderDetailSection
          job={props.job}
          jobId={props.jobId}
          organizationSlug={props.organizationSlug}
          projectId={props.projectId}
        />
      )}
    />
  );
}
