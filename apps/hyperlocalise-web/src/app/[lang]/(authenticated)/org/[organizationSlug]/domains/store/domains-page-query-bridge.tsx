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
import { runInAction } from "mobx";
import { useLayoutEffect } from "react";

import { linkedDomainToResearchDomain } from "@/lib/domains/research-prototype";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { useDomainsPageStore } from "./domains-store-context";

export function linkedDomainsQueryKey(organizationSlug: string) {
  return ["linked-domains", organizationSlug] as const;
}

export function DomainsPageQueryBridge() {
  const store = useDomainsPageStore();
  const { client: goSvcClient } = useGoSvcClient();
  const linkedDomainsQuery = useQuery({
    queryKey: linkedDomainsQueryKey(store.organizationSlug),
    queryFn: async () => {
      const { linkedDomains } = await goSvcClient.domains.listLinkedDomains(store.organizationSlug);
      return linkedDomains;
    },
  });

  useLayoutEffect(() => {
    runInAction(() => {
      if (linkedDomainsQuery.isPending) {
        store.setLoadStatus("loading");
        return;
      }
      if (linkedDomainsQuery.isError) {
        store.setLoadStatus("error");
        return;
      }
      const records = linkedDomainsQuery.data ?? [];
      store.setLinkedDomains(records);
      store.setDomains(records.map((domain) => linkedDomainToResearchDomain(domain)));
      store.setLoadStatus("success");
    });
  }, [linkedDomainsQuery.data, linkedDomainsQuery.isError, linkedDomainsQuery.isPending, store]);

  return null;
}
