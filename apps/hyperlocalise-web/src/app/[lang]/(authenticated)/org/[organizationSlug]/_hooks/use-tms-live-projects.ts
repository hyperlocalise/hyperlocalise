"use client";

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
