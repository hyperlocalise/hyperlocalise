"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  availablePlansSectionId,
  isPlanUsageBillingPath,
  planUsageSectionId,
  scrollToBillingSection,
} from "@/lib/billing/plan-usage";

const billingSectionHashes = new Set([planUsageSectionId, availablePlansSectionId]);

export function PlanUsageHashScroll({ organizationSlug }: { organizationSlug: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isPlanUsageBillingPath(pathname, organizationSlug)) {
      return;
    }

    const sectionId = window.location.hash.slice(1);
    if (!billingSectionHashes.has(sectionId)) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToBillingSection(sectionId);
    });
  }, [organizationSlug, pathname]);

  return null;
}
