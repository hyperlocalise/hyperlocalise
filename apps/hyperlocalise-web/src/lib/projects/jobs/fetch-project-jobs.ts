import { jobsResponseSchema, openJobStatusValues } from "@/api/routes/project/job.schema";
import { parseApiJsonResponse, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { readTmsProviderListResponse } from "@/lib/providers/tms-provider-list-fetch";

const openJobStatuses = new Set<string>(openJobStatusValues);

type ProjectJobRecord = {
  status: string;
  updatedAt: string;
};

export async function fetchNativeProjectJobs(
  organizationSlug: string,
  projectId: string,
  options?: { open?: boolean; limit?: number },
) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$get({
    param: { organizationSlug, projectId },
    query: {
      limit: String(options?.limit ?? 50),
      ...(options?.open ? { open: true } : {}),
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
