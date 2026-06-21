"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";

import type { JobDetailRecord } from "./job-detail-types";
import { JobProviderDetailSection } from "./job-provider-detail-section";
import { NativeJobDetailView } from "./native-job-detail-view";

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

  return (
    <NativeJobDetailView
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      job={jobQuery.data}
      isLoading={jobQuery.isLoading}
      error={jobQuery.isError ? jobQuery.error : undefined}
      isRetryPending={retryJob.isPending}
      isRunAgentPending={runAgentJob.isPending}
      isMarkFailedPending={markJobFailed.isPending}
      markFailedDialogOpen={markFailedDialogOpen}
      onMarkFailedDialogOpenChange={setMarkFailedDialogOpen}
      onRetry={() => retryJob.mutate()}
      onRunAgent={() => runAgentJob.mutate()}
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
