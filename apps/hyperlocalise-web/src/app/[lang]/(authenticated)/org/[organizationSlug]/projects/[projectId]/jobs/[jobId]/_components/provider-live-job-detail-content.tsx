"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";
import { getJobProviderActionAvailability } from "@/lib/providers/job-provider-actions";
import type {
  TmsProviderLiveJobComment,
  TmsProviderLiveJobDetail,
} from "@/lib/providers/tms-provider-live";

import { ProviderJobDescriptionField } from "../../../../../jobs/_components/provider-job-description-field";
import { ProviderLiveJobDetailView } from "./provider-live-job-detail-view";
import { TmsLiveJobFilesSection } from "./tms/tms-live-job-files-section";

async function parseActionError(response: Response, fallback: string) {
  let error: string | undefined;

  try {
    const body = (await response.json()) as { error?: string; message?: string };
    error = body.message ?? body.error;
  } catch {
    error = undefined;
  }

  return error ? `${fallback}: ${error}` : `${fallback} (${response.status})`;
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

  const translateWithAgent = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ]["agent-runs"].$post({
        param: { organizationSlug, encodedJobId: jobId },
        json: {
          projectId,
          action: "translate_with_agent",
        },
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to start agent translation"));
      }

      await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jobQueryKey });
      toast.success("Translation agent is running");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start agent translation");
    },
  });

  const translateAction = jobQuery.data?.externalProviderKind
    ? getJobProviderActionAvailability(jobQuery.data.externalProviderKind).find(
        (action) => action.id === "translate_with_agent",
      )
    : null;

  return (
    <ProviderLiveJobDetailView
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditProviderJobDescription={canEditProviderJobDescription}
      job={jobQuery.data}
      isLoading={jobQuery.isLoading}
      error={jobQuery.isError ? jobQuery.error : undefined}
      isRefreshing={jobQuery.isFetching}
      isTranslateWithAgentPending={translateWithAgent.isPending}
      translateWithAgentAction={translateAction}
      onTranslateWithAgent={() => translateWithAgent.mutate()}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: jobQueryKey });
      }}
      comments={commentsQuery.data ?? []}
      commentsLoading={commentsQuery.isLoading}
      commentsError={commentsQuery.isError ? commentsQuery.error : undefined}
      renderDescriptionField={({ description, editable, job }) => (
        <ProviderJobDescriptionField
          organizationSlug={organizationSlug}
          encodedJobId={job.id}
          description={description}
          editable={editable}
          queryKey={jobQueryKey}
        />
      )}
      renderFilesSection={({
        job,
        jobId: encodedJobId,
        organizationSlug: orgSlug,
        projectId: projId,
      }) =>
        job.externalProviderKind === "crowdin" ? (
          <TmsLiveJobFilesSection
            organizationSlug={orgSlug}
            projectId={projId}
            encodedJobId={encodedJobId}
            highlightLocale={
              typeof job.externalProviderPayload.languageId === "string"
                ? job.externalProviderPayload.languageId
                : null
            }
          />
        ) : null
      }
    />
  );
}
