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
import { GSC_DEFAULT_DATE_RANGE, type GscDateRange } from "@/lib/gsc/constants";
import { getPrototypeSearchConsoleSnapshot } from "@/lib/gsc/prototype";
import type { GscPerformanceSnapshot } from "@/lib/gsc/types";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

export function domainSearchConsoleQueryKey(
  organizationSlug: string,
  linkedDomainId: string,
  localeId: string | null,
  dateRange: GscDateRange,
) {
  return ["domain-search-console", organizationSlug, linkedDomainId, localeId, dateRange] as const;
}

export function useDomainSearchConsole({
  organizationSlug,
  linkedDomainId,
  domainKey,
  localeId,
  dateRange = GSC_DEFAULT_DATE_RANGE,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  domainKey: string | null;
  localeId: string | null;
  dateRange?: GscDateRange;
}) {
  const { client } = useGoSvcClient();
  const live = Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId));

  return {
    live,
    ...useQuery({
      queryKey: domainSearchConsoleQueryKey(organizationSlug, linkedDomainId, localeId, dateRange),
      enabled: Boolean(organizationSlug && domainKey),
      queryFn: async (): Promise<GscPerformanceSnapshot> => {
        if (!live) {
          return getPrototypeSearchConsoleSnapshot(domainKey!);
        }

        try {
          return await client.domains.getSearchConsole(organizationSlug, linkedDomainId, {
            dateRange,
            locale: localeId,
          });
        } catch (error) {
          throw new Error(goSvcErrorMessage(error, "Failed to load Search Console."));
        }
      },
    }),
  };
}
