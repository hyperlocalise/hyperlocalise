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

import { apiClient } from "@/lib/api-client-instance";
import type { TmsUserConnectCta } from "@/lib/providers/credentials/tms-user-connection-shared";

export function tmsUserConnectCtaQueryKey(organizationSlug: string) {
  return ["tms-user-connect-cta", organizationSlug] as const;
}

export function useTmsUserConnectCta(
  organizationSlug: string,
  options?: { enabled?: boolean; initialData?: TmsUserConnectCta },
) {
  return useQuery({
    queryKey: tmsUserConnectCtaQueryKey(organizationSlug),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    queryFn: async (): Promise<TmsUserConnectCta> => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ]["user-connect-cta"].$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load TMS user connect state (${response.status})`);
      }

      const { connectCta } = (await response.json()) as { connectCta: TmsUserConnectCta };
      return connectCta;
    },
  });
}
