import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getUsageFeatureLabel } from "@/lib/billing/usage-feature-labels";

/** DOM id for the billing page plan usage section. */
export const planUsageSectionId = "plan-usage";

export function buildPlanUsageHref(organizationSlug: string) {
  return `/org/${organizationSlug}/settings/billing#${planUsageSectionId}`;
}

export function isPlanUsageBillingPath(pathname: string, organizationSlug: string) {
  const billingPath = `/org/${organizationSlug}/settings/billing`;
  return pathname === billingPath || pathname.endsWith(billingPath);
}

export function scrollToPlanUsageSection(behavior: ScrollBehavior = "smooth") {
  const attemptScroll = (retriesLeft: number) => {
    const element = document.getElementById(planUsageSectionId);
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

type AutumnUsageBalance = {
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

export function formatPrimaryUsageSummary(input: {
  usage: number;
  granted: number;
  unlimited?: boolean | null;
  unitLabel?: string;
}) {
  const unitLabel = (
    input.unitLabel ?? getUsageFeatureLabel(planUsagePrimaryFeatureId)
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
