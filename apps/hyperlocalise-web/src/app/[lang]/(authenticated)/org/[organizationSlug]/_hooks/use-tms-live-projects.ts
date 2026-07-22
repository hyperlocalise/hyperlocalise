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

import { apiClient } from "@/lib/api-client-instance";
import { readTmsProviderListResponse } from "@/lib/providers/jobs/tms-provider-list-fetch";

import type { ApiProject } from "../projects/_components/project-list";
import { useActiveTmsProvider } from "./use-active-tms-provider";

export const tmsLiveProjectsQueryKey = (organizationSlug: string) =>
  ["translation-projects", organizationSlug, "tms-live"] as const;

export async function fetchTmsLiveProjects(organizationSlug: string) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects.$get({
    param: { organizationSlug },
  });

  return readTmsProviderListResponse<ApiProject>(
    response,
    "projects",
    "Failed to load TMS projects",
  );
}

export function useTmsLiveProjects(organizationSlug: string, options?: { enabled?: boolean }) {
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const hasConnection = Boolean(activeTmsProviderQuery.data);
  const enabled = (options?.enabled ?? true) && hasConnection;

  return useQuery({
    queryKey: tmsLiveProjectsQueryKey(organizationSlug),
    enabled,
    queryFn: () => fetchTmsLiveProjects(organizationSlug),
  });
}
