"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

export type ActiveTmsProviderConnection = {
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  validationStatus: string;
  validationMessage: string | null;
};

export const TMS_PROVIDER_CONNECTION_STALE_TIME_MS = 60_000;

export function activeTmsProviderQueryKey(organizationSlug: string) {
  return ["tms-provider-connection", organizationSlug] as const;
}

export async function fetchActiveTmsProviderConnection(
  organizationSlug: string,
): Promise<ActiveTmsProviderConnection | null> {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].connection.$get({
    param: { organizationSlug },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load TMS connection (${response.status})`);
  }

  const body = (await response.json()) as { connection: ActiveTmsProviderConnection };
  return body.connection;
}

export function useActiveTmsProvider(
  organizationSlug: string,
  options?: { initialData?: ActiveTmsProviderConnection | null },
) {
  return useQuery({
    queryKey: activeTmsProviderQueryKey(organizationSlug),
    queryFn: () => fetchActiveTmsProviderConnection(organizationSlug),
    initialData: options?.initialData,
    staleTime: TMS_PROVIDER_CONNECTION_STALE_TIME_MS,
  });
}
