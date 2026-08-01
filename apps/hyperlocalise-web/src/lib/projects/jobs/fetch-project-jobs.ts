/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  jobsResponseSchema,
  openJobStatusValues,
  overviewTriageJobStatusValues,
} from "@/api/routes/project/job.schema";
import { parseApiJsonResponse, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { readTmsProviderListResponse } from "@/lib/providers/jobs/tms-provider-list-fetch";

const openJobStatuses = new Set<string>(openJobStatusValues);
const overviewTriageJobStatuses = new Set<string>(overviewTriageJobStatusValues);

type ProjectJobRecord = {
  id?: string;
  status: string;
  updatedAt: string;
};

function overviewTriageStatusRank(status: string) {
  switch (status) {
    case "waiting_for_review":
      return 0;
    case "failed":
      return 1;
    case "queued":
    case "running":
      return 2;
    default:
      return 3;
  }
}

export async function fetchNativeProjectJobs(
  organizationSlug: string,
  projectId: string,
  options?: { open?: boolean; triage?: boolean; limit?: number },
) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$get({
    param: { organizationSlug, projectId },
    query: {
      limit: String(options?.limit ?? 50),
      ...(options?.triage ? { triage: true } : options?.open ? { open: true } : {}),
    },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load project jobs");
  }

  const { jobs } = await parseApiJsonResponse(
    response,
    jobsResponseSchema,
    "Invalid project jobs response",
  );

  return jobs;
}

export async function fetchTmsProjectJobs(
  organizationSlug: string,
  externalProjectId: string,
  options?: { mine?: boolean },
) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
    ":externalProjectId"
  ].jobs.$get({
    param: { organizationSlug, externalProjectId },
    query: { mine: options?.mine ? "true" : "false" },
  });

  return readTmsProviderListResponse<ProjectJobRecord>(response, "jobs", "Failed to load TMS jobs");
}

export function filterOpenProjectJobs<T extends ProjectJobRecord>(jobs: readonly T[]): T[] {
  return jobs.filter((job) => openJobStatuses.has(job.status));
}

/** Keeps Overview triage-eligible statuses, including failed. */
export function filterOverviewTriageProjectJobs<T extends ProjectJobRecord>(
  jobs: readonly T[],
): T[] {
  return jobs.filter((job) => overviewTriageJobStatuses.has(job.status));
}

/**
 * Filters to triage statuses, ranks review → failed → in-progress, then caps.
 * Use before displaying the Overview Today queue (especially for TMS lists).
 */
export function selectOverviewTriageProjectJobs<T extends ProjectJobRecord>(
  jobs: readonly T[],
  limit: number,
): T[] {
  return filterOverviewTriageProjectJobs(jobs)
    .toSorted((left, right) => {
      const rankDiff =
        overviewTriageStatusRank(left.status) - overviewTriageStatusRank(right.status);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}
