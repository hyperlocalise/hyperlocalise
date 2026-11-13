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

import { isLiveDomainResearchId } from "@/lib/domains/research-prototype";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

export function liveDomainResearchQueryKey(organizationSlug: string, linkedDomainId: string) {
  return ["domain-research", organizationSlug, linkedDomainId] as const;
}

export function useLiveDomainResearch(
  organizationSlug: string | undefined,
  linkedDomainId: string,
) {
  const { client } = useGoSvcClient();
  const live = Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId));
  const query = useQuery({
    queryKey: liveDomainResearchQueryKey(organizationSlug ?? "", linkedDomainId),
    enabled: Boolean(organizationSlug),
    queryFn: async () => {
      try {
        return await client.domains.getResearch(organizationSlug!, linkedDomainId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load domain research."));
      }
    },
  });

  return { live, ...query };
}
