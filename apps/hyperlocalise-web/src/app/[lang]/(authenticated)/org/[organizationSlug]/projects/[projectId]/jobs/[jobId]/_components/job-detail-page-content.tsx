"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { jobBelongsToRouteProject } from "@/lib/projects/routing/resource-path-id";
import {
  parseProviderJobId,
  resolveEncodedProviderJobId,
} from "@/lib/providers/tms-provider-resource-id";

import { useActiveTmsProvider } from "../../../../../_hooks/use-active-tms-provider";

import type { JobDetailRecord } from "./job-detail-types";
import { NativeJobDetailContent } from "./native-job-detail-content";
import { ProviderLiveJobDetailContent } from "./provider-live-job-detail-content";

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
  const encodedProviderJobFromRoute = parseProviderJobId(jobId);

  const routingJobQuery = useQuery({
    queryKey: ["job-routing", organizationSlug, projectId, jobId],
    enabled: !encodedProviderJobFromRoute,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      return jobBelongsToRouteProject(body.job, projectId) ? body.job : null;
    },
  });

  const encodedProviderJobId =
    encodedProviderJobFromRoute !== null
      ? jobId
      : routingJobQuery.data
        ? resolveEncodedProviderJobId({
            jobId,
            projectId,
            externalProviderKind: routingJobQuery.data.externalProviderKind,
            externalJobId: routingJobQuery.data.externalJobId,
            externalTaskId: routingJobQuery.data.externalTaskId,
          })
        : null;

  const useLiveProviderJob =
    Boolean(encodedProviderJobId) &&
    Boolean(activeTmsProviderQuery.data) &&
    parseProviderJobId(encodedProviderJobId)?.providerKind ===
      activeTmsProviderQuery.data?.providerKind;

  if (
    activeTmsProviderQuery.isLoading ||
    (!encodedProviderJobFromRoute && routingJobQuery.isLoading)
  ) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      </main>
    );
  }

  if (useLiveProviderJob && encodedProviderJobId) {
    return (
      <ProviderLiveJobDetailContent
        jobId={encodedProviderJobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        canEditProviderJobDescription={canEditProviderJobDescription}
      />
    );
  }

  return (
    <NativeJobDetailContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
    />
  );
}
