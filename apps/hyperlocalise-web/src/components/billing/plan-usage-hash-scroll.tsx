"use client";

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
