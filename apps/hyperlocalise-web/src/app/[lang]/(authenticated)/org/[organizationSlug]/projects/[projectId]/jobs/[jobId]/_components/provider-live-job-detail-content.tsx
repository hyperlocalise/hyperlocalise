"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/tms-provider-live";
import { parseProviderJobId } from "@/lib/providers/tms-provider-resource-id";

import { ProviderJobDescriptionField } from "../../../../../jobs/_components/provider-job-description-field";
import { useProviderJobLocaleReadiness } from "../../../../../_hooks/use-provider-job-locale-readiness";
import { ProviderLiveJobDetailView } from "./provider-live-job-detail-view";
import { TmsLiveJobFilesSection } from "./tms/tms-live-job-files-section";

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
  const showComments =
    parseProviderJobId(jobId)?.providerKind === "crowdin" ||
    parseProviderJobId(jobId)?.providerKind === "lokalise";

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

  const parsedJobId = parseProviderJobId(jobId);
  const localeReadinessQuery = useProviderJobLocaleReadiness({
    organizationSlug,
    externalProjectId: parsedJobId?.externalProjectId,
    providerKind: jobQuery.data?.externalProviderKind,
    providerPayload: jobQuery.data?.externalProviderPayload,
    enabled: Boolean(jobQuery.data),
  });
  useAppShellBreadcrumbAppend({
    id: "job-detail",
    label: jobQuery.data?.externalTitle,
  });

  return (
    <ProviderLiveJobDetailView
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditProviderJobDescription={canEditProviderJobDescription}
      job={jobQuery.data}
      isLoading={jobQuery.isLoading}
      error={jobQuery.isError ? jobQuery.error : undefined}
      localeReadinessLoading={localeReadinessQuery.isLoading}
      localeReadinessOverride={localeReadinessQuery.data ?? null}
      isRefreshing={jobQuery.isFetching}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: jobQueryKey });
      }}
      showComments={showComments}
      renderDescriptionField={({ description, editable }) => (
        <ProviderJobDescriptionField
          organizationSlug={organizationSlug}
          encodedJobId={jobId}
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
      }) => (
        <TmsLiveJobFilesSection
          organizationSlug={orgSlug}
          projectId={projId}
          encodedJobId={encodedJobId}
          highlightLocale={
            typeof job.externalProviderPayload.languageId === "string"
              ? job.externalProviderPayload.languageId
              : (job.externalTargetLocales?.[0] ?? null)
          }
        />
      )}
    />
  );
}
