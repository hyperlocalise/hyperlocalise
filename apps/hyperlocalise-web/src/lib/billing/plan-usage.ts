import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getUsageFeatureLabel } from "@/lib/billing/usage-feature-labels";

/** DOM id for the billing page plan usage section. */
export const planUsageSectionId = "plan-usage";

/** DOM id for the billing page available plans section. */
export const availablePlansSectionId = "available-plans";

export function buildBillingSectionHref(organizationSlug: string, sectionId: string) {
  return `/org/${organizationSlug}/settings/billing#${sectionId}`;
}

export function buildPlanUsageHref(organizationSlug: string) {
  return buildBillingSectionHref(organizationSlug, planUsageSectionId);
}

export function buildAvailablePlansHref(organizationSlug: string) {
  return buildBillingSectionHref(organizationSlug, availablePlansSectionId);
}

export function isPlanUsageBillingPath(pathname: string, organizationSlug: string) {
  const billingPath = `/org/${organizationSlug}/settings/billing`;
  return pathname === billingPath || pathname.endsWith(billingPath);
}

export function scrollToBillingSection(sectionId: string, behavior: ScrollBehavior = "smooth") {
  const attemptScroll = (retriesLeft: number) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior, block: "start" });
      return;
    }

    if (retriesLeft > 0) {
      requestAnimationFrame(() => attemptScroll(retriesLeft - 1));
    }
  };

  attemptScroll(90);
}

export function scrollToPlanUsageSection(behavior: ScrollBehavior = "smooth") {
  scrollToBillingSection(planUsageSectionId, behavior);
}

/** Primary meter shown in plan usage summaries (sidebar and billing). */
export const planUsagePrimaryFeatureId = autumnFeatureIds.aiTokens;

type AutumnPlanListItem = {
  id: string;
  name: string;
};

type AutumnSubscription = {
  planId?: string | null;
  status?: string | null;
  canceledAt?: number | null;
  currentPeriodEnd?: number | null;
  plan?: {
    name?: string | null;
  } | null;
};

export type AutumnUsageBalance = {
  usage?: number | null;
  remaining?: number | null;
  granted?: number | null;
  unlimited?: boolean | null;
  nextResetAt?: number | null;
};

export function formatPlanIdLabel(planId: string) {
  return planId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveActivePlanName(input: {
  activePlanId: string | null;
  activeSubscriptionPlanName?: string | null;
  plans: AutumnPlanListItem[] | undefined;
}) {
  if (input.activeSubscriptionPlanName) {
    return input.activeSubscriptionPlanName;
  }

  if (!input.activePlanId) {
    return null;
  }

  const planFromList = input.plans?.find((plan) => plan.id === input.activePlanId);
  if (planFromList?.name) {
    return planFromList.name;
  }

  return formatPlanIdLabel(input.activePlanId);
}

export function getActiveSubscription(
  subscriptions: AutumnSubscription[] | undefined | null,
): AutumnSubscription | null {
  if (!subscriptions?.length) {
    return null;
  }

  return (
    subscriptions.find((subscription) => subscription.status === "active") ??
    subscriptions[0] ??
    null
  );
}

export function formatRenewalDate(timestamp: number | null | undefined) {
  if (!timestamp) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(timestamp));
}

export function formatCompactUsageValue(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function getUsageProgressPercent(input: {
  usage: number;
  granted: number;
  unlimited?: boolean | null;
}) {
  if (input.unlimited || input.granted <= 0) {
    return null;
  }

  return Math.min(100, Math.max(0, (input.usage / input.granted) * 100));
}

export function resolveUsageDisplayBalance(input: {
  balance: AutumnUsageBalance | undefined;
  localUsage?: number;
}) {
  const granted = input.balance?.granted ?? 0;
  const unlimited = input.balance?.unlimited ?? false;
  const usage = input.localUsage ?? input.balance?.usage ?? 0;

  return {
    usage,
    granted,
    unlimited,
    remaining:
      input.localUsage === undefined || unlimited
        ? (input.balance?.remaining ?? 0)
        : Math.max(0, granted - usage),
    nextResetAt: input.balance?.nextResetAt ?? null,
  };
}

export function formatPrimaryUsageSummary(input: {
  usage: number;
  granted: number;
  unlimited?: boolean | null;
  unitLabel?: string;
}) {
  const unitLabel = (
    input.unitLabel ??
    getUsageFeatureLabel(planUsagePrimaryFeatureId) ??
    "usage"
  ).toLowerCase();

  if (input.unlimited) {
    return "Unlimited usage";
  }

  return `${formatCompactUsageValue(input.usage)} / ${formatCompactUsageValue(input.granted)} ${unitLabel} used`;
}

export function resolvePlanUsageSummary(input: {
  subscriptions: AutumnSubscription[] | undefined | null;
  balances: Record<string, AutumnUsageBalance | undefined> | undefined | null;
  plans: AutumnPlanListItem[] | undefined;
}) {
  const activeSubscription = getActiveSubscription(input.subscriptions);
  const activePlanId = activeSubscription?.planId ?? null;
  const isScheduledForCancel = Boolean(
    activeSubscription?.canceledAt && activeSubscription.status === "active",
  );
  const activePlanName = activeSubscription
    ? resolveActivePlanName({
        activePlanId,
        activeSubscriptionPlanName: activeSubscription.plan?.name,
        plans: input.plans,
      })
    : null;

  const primaryBalance = input.balances?.[planUsagePrimaryFeatureId];
  const usage = primaryBalance?.usage ?? 0;
  const granted = primaryBalance?.granted ?? 0;
  const unlimited = primaryBalance?.unlimited ?? false;
  const renewalTimestamp =
    activeSubscription?.currentPeriodEnd ?? primaryBalance?.nextResetAt ?? null;
  const renewalLabel = formatRenewalDate(renewalTimestamp);

  return {
    activePlanName,
    isScheduledForCancel,
    renewalLabel,
    renewalCopy: renewalLabel
      ? isScheduledForCancel
        ? `Access until ${renewalLabel}`
        : `Renews on ${renewalLabel}`
      : null,
    usageSummary: formatPrimaryUsageSummary({ usage, granted, unlimited }),
    usageProgressPercent: getUsageProgressPercent({ usage, granted, unlimited }),
    unlimited,
  };
}

export type ResolvedPlanUsageSummary = ReturnType<typeof resolvePlanUsageSummary>;

export function hasPlanUsageMeter(summary: ResolvedPlanUsageSummary) {
  return summary.unlimited || summary.usageProgressPercent !== null;
}
