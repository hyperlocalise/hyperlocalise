"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CreditCardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCustomer, useListPlans } from "autumn-js/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import {
  buildAvailablePlansHref,
  buildPlanUsageHref,
  hasPlanUsageMeter,
  resolvePlanUsageSummary,
  type ResolvedPlanUsageSummary,
} from "@/lib/billing/plan-usage";

function PlanUsageSummarySkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-label="Loading plan usage">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}

export function PlanUsageSummaryContent({ summary }: { summary: ResolvedPlanUsageSummary }) {
  const planName = summary.activePlanName ?? "No active plan";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <TypographyP className="text-sm font-medium text-foreground">{planName}</TypographyP>
        {summary.renewalCopy ? (
          <TypographyP className="text-sm text-muted-foreground">{summary.renewalCopy}</TypographyP>
        ) : null}
      </div>
      {summary.usageProgressPercent !== null ? (
        <Progress
          value={summary.usageProgressPercent}
          aria-label={summary.usageSummary}
          className="[&_[data-slot=progress-track]]:h-2"
        />
      ) : null}
      <TypographyP className="text-sm text-subtle-foreground tabular-nums">
        {summary.usageSummary}
      </TypographyP>
    </div>
  );
}

export function PlanUsageFooterControl({ organizationSlug }: { organizationSlug: string }) {
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

  const isLoading = customerLoading || plansLoading;
  const hasError = Boolean(customerError || plansError);
  const hasActivePlan = Boolean(summary.activePlanName || hasPlanUsageMeter(summary));
  const planName = isLoading ? "Loading plan" : (summary.activePlanName ?? "Choose a plan");

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="xs" aria-label={`Open plan usage: ${planName}`}>
            <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} data-icon="inline-start" />
            <span className="max-w-40 truncate">{planName}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
            <HugeiconsIcon icon={CreditCardIcon} strokeWidth={1.8} className="size-5" />
          </div>
          <DialogTitle>
            {isLoading
              ? "Loading your workspace plan"
              : hasActivePlan
                ? `Your workspace is on the ${summary.activePlanName ?? "current"} plan`
                : "Choose a plan for your workspace"}
          </DialogTitle>
          <DialogDescription>
            Review current usage here or open billing for complete plan details.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {isLoading ? <PlanUsageSummarySkeleton /> : null}
        {hasError ? (
          <TypographyP className="text-sm text-destructive">
            Couldn&apos;t load plan usage. Open billing to try again.
          </TypographyP>
        ) : null}
        {!isLoading && !hasError ? <PlanUsageSummaryContent summary={summary} /> : null}

        <DialogFooter>
          <Button
            variant="ghost"
            render={<Link href={buildAvailablePlansHref(organizationSlug)} />}
          >
            See all plans
          </Button>
          <Button render={<Link href={buildPlanUsageHref(organizationSlug)} />}>
            Open billing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
