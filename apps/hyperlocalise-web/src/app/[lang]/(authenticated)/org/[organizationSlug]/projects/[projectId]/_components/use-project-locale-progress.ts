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

import type { ProjectLocaleProgressResponse } from "@/api/routes/project/project.schema";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export function useProjectLocaleProgressQuery(
  organizationSlug: string,
  projectId: string,
  options?: { enabled?: boolean },
) {
  const { client: goSvcClient } = useGoSvcClient();
  return useQuery({
    queryKey: ["project-locale-progress", organizationSlug, projectId],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      if (parseProviderProjectId(projectId)) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
          "locale-progress"
        ].$get({
          param: { organizationSlug, projectId },
        });
        if (response.status !== 200) {
          throw new Error(`Failed to load locale progress (${response.status})`);
        }
        const body = (await response.json()) as ProjectLocaleProgressResponse;
        return body.locales;
      }

      try {
        const body = await goSvcClient.project.localeProgress(organizationSlug, projectId);
        return body.locales;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load locale progress"), {
          cause: error,
        });
      }
    },
  });
}
