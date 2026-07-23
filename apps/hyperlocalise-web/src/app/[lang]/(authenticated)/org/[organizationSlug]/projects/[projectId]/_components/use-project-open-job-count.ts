"use client";

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
