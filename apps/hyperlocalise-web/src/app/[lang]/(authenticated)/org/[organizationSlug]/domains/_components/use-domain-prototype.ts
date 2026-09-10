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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listResearchPrototypeDomains,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";

// Prototype edits live in the client cache, scoped to the workspace.
export function useDomainPrototype(organizationSlug: string) {
  const queryClient = useQueryClient();
  const queryKey = ["domain-research-prototype", organizationSlug];
  const { data: domains } = useQuery({
    queryKey,
    queryFn: listResearchPrototypeDomains,
    initialData: listResearchPrototypeDomains,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  function saveDomain(domain: DomainResearchDomain) {
    queryClient.setQueryData<DomainResearchDomain[]>(queryKey, (current = []) =>
      current.some((item) => item.id === domain.id)
        ? current.map((item) => (item.id === domain.id ? domain : item))
        : [...current, domain],
    );
  }
  return { domains, saveDomain };
}
