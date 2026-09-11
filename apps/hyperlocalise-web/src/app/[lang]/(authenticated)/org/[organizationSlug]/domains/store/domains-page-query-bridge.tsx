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
import { useIntl } from "react-intl";

import {
  linkedDomainToResearchDomain,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import { domainsPageContentMessages as messages } from "../_components/domains-page-content.messages";
import { useDomainsPageStore } from "./domains-store-context";

export function linkedDomainsQueryKey(organizationSlug: string) {
  return ["linked-domains", organizationSlug] as const;
}

async function fetchLinkedDomains(
  organizationSlug: string,
  loadErrorMessage: string,
): Promise<DomainResearchDomain[]> {
  const response = await fetch(`/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains`);
  const body = (await response.json().catch(() => ({}))) as {
    linkedDomains?: LinkedDomainPublic[];
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.message || body.error || loadErrorMessage);
  }
  return (body.linkedDomains ?? []).map((domain) => linkedDomainToResearchDomain(domain));
}

export function DomainsPageQueryBridge() {
  const intl = useIntl();
  const store = useDomainsPageStore();
  const linkedDomainsQuery = useQuery({
    queryKey: linkedDomainsQueryKey(store.organizationSlug),
    queryFn: () =>
      fetchLinkedDomains(store.organizationSlug, intl.formatMessage(messages.loadError)),
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
      store.setDomains(linkedDomainsQuery.data ?? []);
      store.setLoadStatus("success");
    });
  }, [linkedDomainsQuery.data, linkedDomainsQuery.isError, linkedDomainsQuery.isPending, store]);

  return null;
}
