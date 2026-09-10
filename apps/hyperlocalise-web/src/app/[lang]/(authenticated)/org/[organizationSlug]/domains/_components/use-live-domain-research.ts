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

import {
  isLiveDomainResearchId,
  type DomainResearchCatalog,
} from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

export function liveDomainResearchQueryKey(organizationSlug: string, linkedDomainId: string) {
  return ["domain-research", organizationSlug, linkedDomainId] as const;
}

export function useLiveDomainResearch(
  organizationSlug: string | undefined,
  linkedDomainId: string,
) {
  const live = Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId));
  const query = useQuery({
    queryKey: liveDomainResearchQueryKey(organizationSlug ?? "", linkedDomainId),
    enabled: live,
    queryFn: async () => {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug!)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        catalog?: DomainResearchCatalog;
        linkedDomain?: LinkedDomainPublic;
        message?: string;
        error?: string;
      };
      if (!response.ok || !body.catalog) {
        throw new Error(body.message || body.error || "Failed to load domain research.");
      }
      return { catalog: body.catalog, linkedDomain: body.linkedDomain };
    },
  });

  return { live, ...query };
}
