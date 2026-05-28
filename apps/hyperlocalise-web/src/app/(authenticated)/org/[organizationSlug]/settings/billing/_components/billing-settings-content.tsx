"use client";

import { useMemo, useState } from "react";
import { CreditCardIcon, Wallet03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCustomer, useListPlans } from "autumn-js/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { formatAutumnBillingError } from "@/lib/billing/autumn-errors";
import { getUsageFeatureLabel, meteredUsageFeatureIds } from "@/lib/billing/usage-feature-labels";

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0 ${className}`}
    >
      {children}
    </Card>
  );
}

function formatUsageValue(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatResetDate(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(timestamp));
}

function BillingSettingsHeader() {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-foreground/48">
          <HugeiconsIcon icon={CreditCardIcon} strokeWidth={1.8} className="size-4" />
          <span>Billing settings</span>
        </div>
        <TypographyH1 className="mt-2 font-heading text-2xl font-medium text-foreground md:text-2xl">
          Billing
        </TypographyH1>
        <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
          View your workspace plan, metered usage balances, and manage subscription billing through
          Autumn.
        </TypographyP>
      </div>
    </section>
  );
}

function BillingSettingsPanel({
  autumnConfigured,
  canManageBilling,
  organizationSlug,
}: {
  autumnConfigured: boolean;
  canManageBilling: boolean;
  organizationSlug: string;
}) {
  const [actionPending, setActionPending] = useState<string | null>(null);
  const {
    data: customer,
    isLoading: customerLoading,
    error: customerError,
    refetch: refetchCustomer,
    attach,
    updateSubscription,
    openCustomerPortal,
  } = useCustomer();
  const { data: plans, isLoading: plansLoading, error: plansError } = useListPlans();

  const activeSubscription = useMemo(() => {
    if (!customer?.subscriptions?.length) {
      return null;
    }

    return (
      customer.subscriptions.find((subscription) => subscription.status === "active") ??
      customer.subscriptions[0] ??
      null
    );
  }, [customer?.subscriptions]);

  const activePlanId = activeSubscription?.planId ?? null;
  const isScheduledForCancel = Boolean(
    activeSubscription?.canceledAt && activeSubscription.status === "active",
  );
  const usageRows = meteredUsageFeatureIds.map((featureId) => {
    const balance = customer?.balances?.[featureId];
    return {
      featureId,
      label: getUsageFeatureLabel(featureId),
      usage: balance?.usage ?? 0,
      remaining: balance?.remaining ?? 0,
      granted: balance?.granted ?? 0,
      unlimited: balance?.unlimited ?? false,
      nextResetAt: balance?.nextResetAt ?? null,
    };
  });

  const billingError = customerError ?? plansError;
  const isLoading = customerLoading || plansLoading;

  async function runBillingAction(actionId: string, action: () => Promise<unknown>) {
    setActionPending(actionId);
    try {
      await action();
      await refetchCustomer();
    } catch (error) {
      toast.error(formatAutumnBillingError(error));
    } finally {
      setActionPending(null);
    }
  }

  async function handleAttachPlan(planId: string) {
    await runBillingAction(`attach-${planId}`, () => attach({ planId }));
  }

  async function handleCancelSubscription() {
    if (!activePlanId) {
      return;
    }

    await runBillingAction("cancel", () =>
      updateSubscription({
        planId: activePlanId,
        cancelAction: "cancel_end_of_cycle",
      }),
    );
  }

  async function handleUncancelSubscription() {
    if (!activePlanId) {
      return;
    }

    await runBillingAction("uncancel", () =>
      updateSubscription({
        planId: activePlanId,
        cancelAction: "uncancel",
      }),
    );
  }

  async function handleOpenPortal() {
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/org/${organizationSlug}/settings/billing`
        : undefined;

    await runBillingAction("portal", () => openCustomerPortal({ returnUrl }));
  }

  if (!autumnConfigured) {
    return (
      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Billing unavailable</CardTitle>
          <CardDescription className="text-foreground/52">
            Autumn is not configured in this environment. Add a sandbox `AUTUMN_API_KEY` to enable
            billing for this workspace.
          </CardDescription>
        </CardHeader>
      </SurfaceCard>
    );
  }

  if (isLoading) {
    return (
      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Loading billing</CardTitle>
          <CardDescription className="text-foreground/52">
            Fetching plan and usage details for this workspace.
          </CardDescription>
        </CardHeader>
      </SurfaceCard>
    );
  }

  if (billingError) {
    return (
      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">
            Unable to load billing
          </CardTitle>
          <CardDescription className="text-foreground/52">
            {formatAutumnBillingError(billingError)}
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="px-5 py-4">
          <Button variant="outline" onClick={() => void refetchCustomer()}>
            Try again
          </Button>
        </CardContent>
      </SurfaceCard>
    );
  }

  return (
    <>
      <section className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-medium text-foreground">
                  {activeSubscription?.plan?.name ?? "No active plan"}
                </CardTitle>
                <CardDescription className="mt-1 text-foreground/52">
                  {activeSubscription
                    ? `Status: ${activeSubscription.status.replaceAll("_", " ")}`
                    : "Choose a plan below to start a subscription for this workspace."}
                </CardDescription>
              </div>
              {activeSubscription ? (
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full border-bud-500/25 bg-bud-500/10 text-bud-100"
                >
                  {isScheduledForCancel ? "Canceling" : "Active"}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-5">
            {activeSubscription?.currentPeriodEnd ? (
              <TypographyP className="text-sm text-foreground/52">
                Current period ends {formatResetDate(activeSubscription.currentPeriodEnd)}
              </TypographyP>
            ) : null}
            {canManageBilling && isScheduledForCancel ? (
              <div className="mt-4">
                <Button
                  variant="outline"
                  disabled={actionPending !== null}
                  onClick={() => void handleUncancelSubscription()}
                >
                  {actionPending === "uncancel" ? "Restoring…" : "Restore subscription"}
                </Button>
              </div>
            ) : null}
            {canManageBilling && activeSubscription && !isScheduledForCancel ? (
              <div className="mt-4">
                <Button
                  variant="outline"
                  disabled={actionPending !== null}
                  onClick={() => void handleCancelSubscription()}
                >
                  {actionPending === "cancel" ? "Scheduling…" : "Cancel at period end"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
              <HugeiconsIcon icon={Wallet03Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-foreground">Stripe portal</CardTitle>
            <CardDescription className="leading-6 text-foreground/52">
              Update payment methods, review invoices, and manage subscription details in Stripe.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-4">
            <Button
              variant="outline"
              className="border-foreground/10 bg-transparent"
              disabled={!canManageBilling || actionPending !== null}
              onClick={() => void handleOpenPortal()}
            >
              {actionPending === "portal" ? "Opening…" : "Open billing portal"}
            </Button>
            {!canManageBilling ? (
              <TypographyP className="mt-3 text-xs text-foreground/42">
                Only workspace owners and admins can open the billing portal.
              </TypographyP>
            ) : null}
          </CardContent>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Usage balances</CardTitle>
          <CardDescription className="text-foreground/52">
            Metered usage for this billing cycle. Enforcement happens server-side; this panel is for
            visibility only.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="divide-y divide-foreground/8 px-5 py-0">
          {usageRows.map((row) => (
            <div key={row.featureId} className="flex items-center justify-between gap-4 py-4">
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  {row.label}
                </TypographyP>
                <TypographyP className="text-xs text-foreground/42">
                  Resets {formatResetDate(row.nextResetAt)}
                </TypographyP>
              </div>
              <div className="text-right">
                <TypographyP className="text-sm font-medium text-foreground">
                  {row.unlimited
                    ? "Unlimited"
                    : `${formatUsageValue(row.usage)} / ${formatUsageValue(row.granted)} used`}
                </TypographyP>
                {!row.unlimited ? (
                  <TypographyP className="text-xs text-foreground/42">
                    {formatUsageValue(row.remaining)} remaining
                  </TypographyP>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </SurfaceCard>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Available plans</CardTitle>
          <CardDescription className="text-foreground/52">
            Plans are configured in Autumn. Pricing changes there do not require app migrations.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="divide-y divide-foreground/8 px-5 py-0">
          {(plans ?? []).map((plan) => {
            const isCurrentPlan = plan.id === activePlanId;
            return (
              <div key={plan.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <TypographyP className="text-sm font-medium text-foreground">
                    {plan.name}
                  </TypographyP>
                  <TypographyP className="mt-1 max-w-xl text-sm leading-6 text-foreground/48">
                    {plan.description ?? "Workspace subscription plan"}
                  </TypographyP>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {isCurrentPlan ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
                    >
                      Current plan
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManageBilling || actionPending !== null}
                      onClick={() => void handleAttachPlan(plan.id)}
                    >
                      {actionPending === `attach-${plan.id}` ? "Starting…" : "Select plan"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!plans?.length ? (
            <div className="py-4">
              <TypographyP className="text-sm text-foreground/52">
                No plans are configured in Autumn yet.
              </TypographyP>
            </div>
          ) : null}
        </CardContent>
      </SurfaceCard>
    </>
  );
}

export function BillingSettingsPageContent({
  autumnConfigured,
  canManageBilling,
  organizationSlug,
}: {
  autumnConfigured: boolean;
  canManageBilling: boolean;
  organizationSlug: string;
}) {
  return (
    <main className="space-y-5">
      <BillingSettingsHeader />
      <BillingSettingsPanel
        autumnConfigured={autumnConfigured}
        canManageBilling={canManageBilling}
        organizationSlug={organizationSlug}
      />
    </main>
  );
}
