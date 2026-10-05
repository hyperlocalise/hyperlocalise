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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { isLiveDomainResearchId } from "@/lib/domains/research-prototype";

export function domainOverviewQueryKey(
  organizationSlug: string,
  linkedDomainId: string,
  marketId: string,
) {
  return ["domain-overview", organizationSlug, linkedDomainId, marketId] as const;
}

export function useDomainOverview(
  organizationSlug: string,
  linkedDomainId: string,
  marketId: string,
) {
  const { client } = useGoSvcClient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: domainOverviewQueryKey(organizationSlug, linkedDomainId, marketId),
    enabled: Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId) && marketId),
    queryFn: async () => {
      try {
        return await client.domains.getOverview(organizationSlug, linkedDomainId, marketId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load domain Overview."));
      }
    },
  });
  const refresh = useMutation({
    mutationFn: async () => {
      try {
        return await client.domains.refreshOverview(organizationSlug, linkedDomainId, { marketId });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to refresh domain Overview."));
      }
    },
    onSuccess: ({ overview }) => {
      queryClient.setQueryData(
        domainOverviewQueryKey(organizationSlug, linkedDomainId, marketId),
        overview,
      );
    },
  });
  return { ...query, refresh };
}
