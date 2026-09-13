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

import { GSC_DEFAULT_DATE_RANGE, type GscDateRange } from "@/lib/gsc/constants";
import { getPrototypeSearchConsoleSnapshot } from "@/lib/gsc/prototype";
import type { GscPerformanceSnapshot } from "@/lib/gsc/types";
import { isLiveDomainResearchId } from "@/lib/domains/research-prototype";

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

        const params = new URLSearchParams({ dateRange });
        if (localeId) {
          params.set("locale", localeId);
        }
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/search-console?${params}`,
        );
        const body = (await response.json().catch(() => ({}))) as {
          searchConsole?: GscPerformanceSnapshot;
          message?: string;
          error?: string;
        };
        if (!response.ok || !body.searchConsole) {
          throw new Error(body.message || body.error || "Failed to load Search Console.");
        }
        return body.searchConsole;
      },
    }),
  };
}
