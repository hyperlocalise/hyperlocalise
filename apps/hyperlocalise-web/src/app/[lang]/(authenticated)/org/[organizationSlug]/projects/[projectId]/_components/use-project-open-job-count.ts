"use client";

import { useQuery } from "@tanstack/react-query";

import { projectOpenJobCountResponseSchema } from "@/api/routes/project/project.schema";
import { parseApiJsonResponse, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export function useProjectOpenJobCountQuery(
  organizationSlug: string,
  projectId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["project-open-job-count", organizationSlug, projectId],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "open-job-count"
      ].$get({
        param: { organizationSlug, projectId },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load open job count");
      }

      const body = await parseApiJsonResponse(
        response,
        projectOpenJobCountResponseSchema,
        "Invalid open job count response",
      );

      return body.openJobCount;
    },
  });
}
