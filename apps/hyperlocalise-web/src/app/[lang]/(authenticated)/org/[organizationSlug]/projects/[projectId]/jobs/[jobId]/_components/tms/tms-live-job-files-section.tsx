"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";

import { tmsLiveFileToProjectFileRecord } from "./job-source-file-mappers";
import { JobSourceFilesPanel } from "./job-source-files-panel";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import { tmsLiveJobFilesSectionMessages as messages } from "./tms-live-job-files-section.messages";

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
  const intl = useIntl();
  const filesQuery = useQuery({
    queryKey: tmsLiveJobFilesQueryKey(organizationSlug, encodedJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].files.$get({
        param: { organizationSlug, encodedJobId },
      });

      if (!response.ok) {
        throw new Error(
          intl.formatMessage(messages.failedToLoadTaskFiles, { status: response.status }),
        );
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
        filesQuery.error instanceof Error
          ? filesQuery.error.message
          : intl.formatMessage(messages.unableToLoadTaskFiles)
      }
      emptyMessage={intl.formatMessage(messages.noFilesLinked)}
      highlightLocale={highlightLocale ?? null}
      queueFilter={queueFilter}
    />
  );
}
