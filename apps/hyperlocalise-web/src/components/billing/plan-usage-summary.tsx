"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCustomer, useListPlans } from "autumn-js/react";

import { TypographyP } from "@/components/ui/typography";
import {
  availablePlansSectionId,
  buildAvailablePlansHref,
  buildPlanUsageHref,
  hasPlanUsageMeter,
  isPlanUsageBillingPath,
  planUsageSectionId,
  resolvePlanUsageSummary,
  scrollToBillingSection,
  type ResolvedPlanUsageSummary,
} from "@/lib/billing/plan-usage";

function PlanUsageSummarySkeleton({ variant }: { variant: "sidebar" | "billing" }) {
  if (variant === "sidebar") {
    return (
      <div className="rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-3">
        <div className="h-3 w-16 animate-pulse rounded bg-sidebar-accent" />
        <div className="mt-3 h-3 w-24 animate-pulse rounded bg-sidebar-accent" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-sidebar-accent" />
        <div className="mt-3 h-1.5 animate-pulse rounded-full bg-sidebar-accent" />
        <div className="mt-3 h-3 w-28 animate-pulse rounded bg-sidebar-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-5">
      <div className="h-4 w-28 animate-pulse rounded bg-accent" />
      <div className="h-3 w-40 animate-pulse rounded bg-accent" />
      <div className="h-1.5 animate-pulse rounded-full bg-accent" />
      <div className="h-3 w-36 animate-pulse rounded bg-accent" />
    </div>
  );
}

function SidebarPlanUsageShell({
  children,
  href,
  onViewUsageClick,
}: {
  children: React.ReactNode;
  href: string;
  onViewUsageClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className="mt-auto px-1 pb-2 group-data-[collapsible=icon]:hidden">
      <Link
        href={href}
        onClick={onViewUsageClick}
        className="block rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-3 transition-colors hover:bg-sidebar-accent/80"
      >
        {children}
      </Link>
    </div>
  );
}

export function PlanUsageSummaryContent({
  summary,
  variant,
}: {
  summary: ResolvedPlanUsageSummary;
  variant: "sidebar" | "billing";
}) {
  const planName = summary.activePlanName ?? "No active plan";
  const isSidebar = variant === "sidebar";
  const planNameClassName = isSidebar
    ? "mt-3 text-xs text-sidebar-foreground"
    : "text-sm font-medium text-foreground";
  const renewalClassName = isSidebar
    ? "mt-1 text-xs text-sidebar-muted-foreground"
    : "mt-1 text-sm text-muted-foreground";
  const usageClassName = isSidebar
    ? "mt-3 text-xs text-sidebar-muted-foreground"
    : "mt-3 text-sm text-subtle-foreground";
  const progressTrackClassName = isSidebar
    ? "mt-3 h-1.5 overflow-hidden rounded-full bg-sidebar-accent"
    : "mt-4 h-2 overflow-hidden rounded-full bg-accent";

  return (
    <>
      {isSidebar ? (
        <TypographyP className="text-xs font-medium text-sidebar-foreground">
          Plan usage
        </TypographyP>
      ) : null}
      <TypographyP className={planNameClassName}>{planName}</TypographyP>
      {summary.renewalCopy ? (
        <TypographyP className={renewalClassName}>{summary.renewalCopy}</TypographyP>
      ) : null}
      {summary.usageProgressPercent !== null ? (
        <div className={progressTrackClassName}>
          <div
            className="h-full rounded-full bg-bud-500"
            style={{ width: `${summary.usageProgressPercent}%` }}
          />
        </div>
      ) : null}
      <TypographyP className={usageClassName}>{summary.usageSummary}</TypographyP>
      {isSidebar ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-muted-foreground">
          <span>View usage</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-3.5" />
        </div>
      ) : null}
    </>
  );
}

export function PlanUsageSidebarWidget({ organizationSlug }: { organizationSlug: string }) {
  const pathname = usePathname();
  const { data: customer, isLoading: customerLoading, error: customerError } = useCustomer();
  const { data: plans, isLoading: plansLoading, error: plansError } = useListPlans();

  const summary = useMemo(
    () =>
      resolvePlanUsageSummary({
        subscriptions: customer?.subscriptions,
        balances: customer?.balances,
        plans,
      }),
    [customer?.balances, customer?.subscriptions, plans],
  );

  function handleBillingSectionClick(
    sectionId: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) {
    if (!isPlanUsageBillingPath(pathname, organizationSlug)) {
      return;
    }

    event.preventDefault();
    scrollToBillingSection(sectionId);
    window.history.replaceState(null, "", `#${sectionId}`);
  }

  function handleViewUsageClick(event: React.MouseEvent<HTMLAnchorElement>) {
    handleBillingSectionClick(planUsageSectionId, event);
  }

  function handleViewPlansClick(event: React.MouseEvent<HTMLAnchorElement>) {
    handleBillingSectionClick(availablePlansSectionId, event);
  }

  if (customerLoading || plansLoading) {
    return (
      <div className="mt-auto px-1 pb-2 group-data-[collapsible=icon]:hidden">
        <PlanUsageSummarySkeleton variant="sidebar" />
      </div>
    );
  }

  if (customerError || plansError) {
    return (
      <SidebarPlanUsageShell href={buildPlanUsageHref(organizationSlug)}>
        <TypographyP className="text-xs font-medium text-sidebar-foreground">
          Plan usage
        </TypographyP>
        <TypographyP className="mt-3 text-xs text-sidebar-muted-foreground">
          Couldn&apos;t load usage right now.
        </TypographyP>
        <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-muted-foreground">
          <span>Open billing</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-3.5" />
        </div>
      </SidebarPlanUsageShell>
    );
  }

  if (!summary.activePlanName && !hasPlanUsageMeter(summary)) {
    return (
      <SidebarPlanUsageShell
        href={buildAvailablePlansHref(organizationSlug)}
        onViewUsageClick={handleViewPlansClick}
      >
        <TypographyP className="text-xs font-medium text-sidebar-foreground">
          Plan usage
        </TypographyP>
        <TypographyP className="mt-3 text-xs text-sidebar-foreground">No active plan</TypographyP>
        <TypographyP className="mt-1 text-xs text-sidebar-muted-foreground">
          Choose a plan to start tracking usage.
        </TypographyP>
        <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-muted-foreground">
          <span>View plans</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-3.5" />
        </div>
      </SidebarPlanUsageShell>
    );
  }

  return (
    <SidebarPlanUsageShell
      href={buildPlanUsageHref(organizationSlug)}
      onViewUsageClick={handleViewUsageClick}
    >
      <PlanUsageSummaryContent summary={summary} variant="sidebar" />
    </SidebarPlanUsageShell>
  );
}
