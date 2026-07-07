"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";

import { tmsLiveFileToProjectFileRecord } from "./job-source-file-mappers";
import { JobSourceFilesPanel } from "./job-source-files-panel";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";

function tmsLiveJobFilesQueryKey(organizationSlug: string, encodedJobId: string) {
  return ["tms-provider-job-files", organizationSlug, encodedJobId] as const;
}

export function TmsLiveJobFilesSection({
  organizationSlug,
  projectId,
  encodedJobId,
  highlightLocale,
  queueFilter,
}: {
  organizationSlug: string;
  projectId: string;
  encodedJobId: string;
  highlightLocale?: string | null;
  queueFilter?: CatQueueFilter;
}) {
  const filesQuery = useQuery({
    queryKey: tmsLiveJobFilesQueryKey(organizationSlug, encodedJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].files.$get({
        param: { organizationSlug, encodedJobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load task files (${response.status})`);
      }

      const body = (await response.json()) as { files: TmsProviderLiveFile[] };
      return body.files;
    },
  });

  const files = (filesQuery.data ?? []).map(tmsLiveFileToProjectFileRecord);

  return (
    <JobSourceFilesPanel
      organizationSlug={organizationSlug}
      projectId={projectId}
      encodedJobId={encodedJobId}
      files={files}
      isLoading={filesQuery.isLoading}
      isError={filesQuery.isError}
      errorMessage={
        filesQuery.error instanceof Error ? filesQuery.error.message : "Unable to load task files"
      }
      emptyMessage="No files are linked to this task."
      highlightLocale={highlightLocale ?? null}
      queueFilter={queueFilter}
    />
  );
}
