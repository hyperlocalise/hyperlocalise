"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { useMemo } from "react";
import { CreditCardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCustomer, useListPlans } from "autumn-js/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

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

import { planUsageSummaryMessages } from "./plan-usage-summary.messages";

function PlanUsageSummarySkeleton() {
  const intl = useIntl();

  return (
    <div
      className="flex flex-col gap-3 py-2"
      aria-label={intl.formatMessage(planUsageSummaryMessages.loadingPlanUsageAriaLabel)}
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}

function formatRenewalCopy(summary: ResolvedPlanUsageSummary, intl: IntlShape) {
  if (!summary.renewalLabel) {
    return null;
  }

  return intl.formatMessage(
    summary.isScheduledForCancel
      ? planUsageSummaryMessages.accessUntil
      : planUsageSummaryMessages.renewsOn,
    { date: summary.renewalLabel },
  );
}

export function PlanUsageSummaryContent({ summary }: { summary: ResolvedPlanUsageSummary }) {
  const intl = useIntl();
  const planName =
    summary.activePlanName ?? intl.formatMessage(planUsageSummaryMessages.noActivePlan);
  const renewalCopy = formatRenewalCopy(summary, intl);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <TypographyP className="text-sm font-medium text-foreground">{planName}</TypographyP>
        {renewalCopy ? (
          <TypographyP className="text-sm text-muted-foreground">{renewalCopy}</TypographyP>
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
  const intl = useIntl();
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
  const planName = isLoading
    ? intl.formatMessage(planUsageSummaryMessages.loadingPlan)
    : (summary.activePlanName ?? intl.formatMessage(planUsageSummaryMessages.chooseAPlan));

  const dialogTitle = isLoading ? (
    <FormattedMessage {...planUsageSummaryMessages.loadingWorkspacePlanTitle} />
  ) : hasActivePlan ? (
    <FormattedMessage
      {...planUsageSummaryMessages.activeWorkspacePlanTitle}
      values={{
        planName:
          summary.activePlanName ??
          intl.formatMessage(planUsageSummaryMessages.currentPlanFallback),
      }}
    />
  ) : (
    <FormattedMessage {...planUsageSummaryMessages.chooseWorkspacePlanTitle} />
  );

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            aria-label={intl.formatMessage(planUsageSummaryMessages.openPlanUsageAriaLabel, {
              planName,
            })}
          >
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
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            <FormattedMessage {...planUsageSummaryMessages.dialogDescription} />
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {isLoading ? <PlanUsageSummarySkeleton /> : null}
        {hasError ? (
          <TypographyP className="text-sm text-destructive">
            <FormattedMessage {...planUsageSummaryMessages.loadError} />
          </TypographyP>
        ) : null}
        {!isLoading && !hasError ? <PlanUsageSummaryContent summary={summary} /> : null}

        <DialogFooter>
          <Button
            variant="ghost"
            render={<Link href={buildAvailablePlansHref(organizationSlug)} />}
          >
            <FormattedMessage {...planUsageSummaryMessages.seeAllPlans} />
          </Button>
          <Button render={<Link href={buildPlanUsageHref(organizationSlug)} />}>
            <FormattedMessage {...planUsageSummaryMessages.openBilling} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
