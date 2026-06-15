"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";
import type { JobProviderActionId } from "@/lib/providers/job-provider-actions";

import { JobAgentRunDiffReviewSection } from "./job-agent-run-diff-review-section";
import { JobProviderDetailSectionView } from "./job-provider-detail-section-view";
import { JobQaFindingsSection } from "./job-qa-findings-section";
import type { AgentRunRecord, ProviderBackedJobFields } from "./job-detail-types";
import { SyncedJobSourceFilesSection } from "./tms/synced-job-source-files-section";

export type {
  AgentRunRecord,
  ProviderActionAvailability,
  ProviderBackedJobFields,
  ProviderSourceFile,
} from "./job-detail-types";

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

export function JobProviderDetailSection({
  job,
  jobId,
  organizationSlug,
  projectId,
}: {
  job: ProviderBackedJobFields;
  jobId: string;
  organizationSlug: string;
  projectId: string | null;
}) {
  const queryClient = useQueryClient();
  const jobQueryKey = ["job", organizationSlug, projectId ?? "workspace", jobId] as const;
  const agentRunsQueryKey = ["job-agent-runs", organizationSlug, jobId] as const;

  const agentRunsQuery = useQuery({
    queryKey: agentRunsQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "agent-runs"
      ].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load agent runs (${response.status})`);
      }

      const body = (await response.json()) as { agentRuns: AgentRunRecord[] };
      return body.agentRuns;
    },
    refetchInterval: (query) => {
      const runs = query.state.data;
      if (!runs) {
        return false;
      }

      const hasActiveRun = runs.some((run) => run.status === "queued" || run.status === "running");
      return hasActiveRun ? 3000 : false;
    },
  });

  const startAgentRun = useMutation({
    mutationFn: async (action: JobProviderActionId) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "agent-runs"
      ].$post({
        param: { organizationSlug, jobId },
        json: { action },
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to start agent run"));
      }

      const body = (await response.json()) as { agentRun: AgentRunRecord };
      return body.agentRun;
    },
    onSuccess: async (_data, action) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentRunsQueryKey }),
        queryClient.invalidateQueries({ queryKey: jobQueryKey }),
      ]);
      toast.success(
        action === "translate_with_agent" ? "Translation agent is running" : "Agent run queued",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start agent run");
    },
  });

  return (
    <JobProviderDetailSectionView
      job={job}
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      agentRuns={agentRunsQuery.data}
      agentRunsLoading={agentRunsQuery.isLoading}
      agentRunsError={agentRunsQuery.isError ? agentRunsQuery.error : undefined}
      pendingActionId={startAgentRun.isPending ? startAgentRun.variables : null}
      onStartAgentRun={(actionId) => startAgentRun.mutate(actionId)}
      renderSourceFiles={({ job: providerJob, organizationSlug: orgSlug, projectId: projId }) => (
        <SyncedJobSourceFilesSection
          organizationSlug={orgSlug}
          projectId={projId}
          providerKind={providerJob.externalProviderKind}
          sourceFiles={providerJob.providerSourceFiles ?? []}
          highlightLocale={providerJob.externalTargetLocales?.[0] ?? null}
        />
      )}
      renderQaFindings={(props) => (
        <JobQaFindingsSection
          jobId={props.jobId}
          organizationSlug={props.organizationSlug}
          projectId={props.projectId}
          externalUrl={props.job.externalUrl}
          agentRuns={props.agentRuns}
          agentRunsLoading={props.agentRunsLoading}
          providerActions={props.job.providerActions ?? []}
          onAgentRunStarted={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: agentRunsQueryKey }),
              queryClient.invalidateQueries({ queryKey: jobQueryKey }),
            ]);
          }}
        />
      )}
      renderDiffReview={(props) => (
        <JobAgentRunDiffReviewSection
          jobId={props.jobId}
          organizationSlug={props.organizationSlug}
          agentRuns={props.agentRuns}
          agentRunsLoading={props.agentRunsLoading}
        />
      )}
    />
  );
}
