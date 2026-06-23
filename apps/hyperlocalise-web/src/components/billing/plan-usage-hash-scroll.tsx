"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  isPlanUsageBillingPath,
  planUsageSectionId,
  scrollToPlanUsageSection,
} from "@/lib/billing/plan-usage";

export function PlanUsageHashScroll({ organizationSlug }: { organizationSlug: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isPlanUsageBillingPath(pathname, organizationSlug)) {
      return;
    }

    if (window.location.hash !== `#${planUsageSectionId}`) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToPlanUsageSection();
    });
  }, [organizationSlug, pathname]);

  return null;
}
