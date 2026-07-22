"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";

import {
  fetchNativeProjectJobs,
  fetchTmsProjectJobs,
  filterOpenProjectJobs,
} from "@/lib/projects/jobs/fetch-project-jobs";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import type { ApiJob } from "../../../jobs/_components/jobs-page-view";

export function useProjectOverviewJobsQuery(
  organizationSlug: string,
  projectId: string,
  options?: { enabled?: boolean },
) {
  const parsedProviderProject = parseProviderProjectId(projectId);

  return useQuery({
    queryKey: [
      "project-overview-jobs",
      organizationSlug,
      projectId,
      parsedProviderProject?.providerKind ?? "native",
    ],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      if (parsedProviderProject) {
        const jobs = await fetchTmsProjectJobs(
          organizationSlug,
          parsedProviderProject.externalProjectId,
        );
        return filterOpenProjectJobs(jobs).slice(0, 5) as ApiJob[];
      }

      return (await fetchNativeProjectJobs(organizationSlug, projectId, {
        open: true,
        limit: 5,
      })) as ApiJob[];
    },
  });
}
