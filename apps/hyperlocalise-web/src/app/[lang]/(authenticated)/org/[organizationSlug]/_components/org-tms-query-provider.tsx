"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  activeTmsProviderQueryKey,
  fetchActiveTmsProviderConnection,
  TMS_PROVIDER_CONNECTION_STALE_TIME_MS,
  type ActiveTmsProviderConnection,
} from "../_hooks/use-active-tms-provider";

export function OrgTmsQueryProvider({
  children,
  initialTmsProviderConnection,
  organizationSlug,
}: {
  children: ReactNode;
  initialTmsProviderConnection: ActiveTmsProviderConnection | null;
  organizationSlug: string;
}) {
  useQuery({
    queryKey: activeTmsProviderQueryKey(organizationSlug),
    queryFn: () => fetchActiveTmsProviderConnection(organizationSlug),
    initialData: initialTmsProviderConnection,
    staleTime: TMS_PROVIDER_CONNECTION_STALE_TIME_MS,
  });

  return children;
}
