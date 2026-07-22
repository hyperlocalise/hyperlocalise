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
import { useMemo, useState } from "react";
import { CreditCardIcon, Wallet03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { AutumnClientError, useCustomer, useListPlans } from "autumn-js/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { PlanUsageSummaryContent } from "@/components/billing/plan-usage-summary";
import { PlanUsageHashScroll } from "@/components/billing/plan-usage-hash-scroll";
import {
  getActiveSubscription,
  availablePlansSectionId,
  planUsagePrimaryFeatureId,
  planUsageSectionId,
  resolveUsageDisplayBalance,
  resolvePlanUsageSummary,
} from "@/lib/billing/plan-usage";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { billingBalanceFeatureIds } from "@/lib/billing/usage-feature-labels";
import { apiClient } from "@/lib/api-client-instance";

import { billingSettingsContentMessages } from "./billing-settings-content.messages";

const workspaceResourceFeatureIds = [
  autumnFeatureIds.seats,
  autumnFeatureIds.projects,
  autumnFeatureIds.automations,
  autumnFeatureIds.integrations,
] as const;

type WorkspaceResourceFeatureId = (typeof workspaceResourceFeatureIds)[number];

const workspaceResourceUsageFeatureIds = new Set<string>(workspaceResourceFeatureIds);

function SurfaceCard({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card
      id={id}
      className={`rounded-lg border border-border bg-muted py-0 text-foreground ring-0 ${className}`}
    >
      {children}
    </Card>
  );
}

function formatUsageValue(intl: IntlShape, value: number) {
  return intl.formatNumber(value, { maximumFractionDigits: 0 });
}

function formatResetDate(intl: IntlShape, timestamp: number | null | undefined) {
  if (!timestamp) {
    return intl.formatMessage(billingSettingsContentMessages.noResetDate);
  }

  return intl.formatDate(new Date(timestamp), { dateStyle: "medium" });
}

function isWorkspaceResourceFeatureId(featureId: string): featureId is WorkspaceResourceFeatureId {
  return workspaceResourceUsageFeatureIds.has(featureId);
}

function getLocalizedUsageFeatureLabel(intl: IntlShape, featureId: string) {
  switch (featureId) {
    case autumnFeatureIds.aiTokens:
      return intl.formatMessage(billingSettingsContentMessages.featureAiCredit);
    case autumnFeatureIds.translationJobs:
      return intl.formatMessage(billingSettingsContentMessages.featureTranslationJobs);
    case autumnFeatureIds.agentRuns:
      return intl.formatMessage(billingSettingsContentMessages.featureAgentRuns);
    case autumnFeatureIds.seats:
      return intl.formatMessage(billingSettingsContentMessages.featureSeats);
    case autumnFeatureIds.projects:
      return intl.formatMessage(billingSettingsContentMessages.featureProjects);
    case autumnFeatureIds.automations:
      return intl.formatMessage(billingSettingsContentMessages.featureAutomations);
    case autumnFeatureIds.integrations:
      return intl.formatMessage(billingSettingsContentMessages.featureIntegrations);
    default:
      return featureId.replaceAll("_", " ");
  }
}

function getBillingErrorCode(error: unknown): string | null {
  if (error instanceof AutumnClientError) {
    return error.code;
  }

  if (error && typeof error === "object" && ("error" in error || "code" in error)) {
    const apiError = error as { error?: string; code?: string };
    return apiError.error ?? apiError.code ?? null;
  }

  return null;
}

function formatBillingError(intl: IntlShape, error: unknown): string {
  switch (getBillingErrorCode(error)) {
    case "billing_read_forbidden":
      return intl.formatMessage(billingSettingsContentMessages.billingReadForbidden);
    case "billing_write_forbidden":
      return intl.formatMessage(billingSettingsContentMessages.billingWriteForbidden);
    case "billing_customer_unavailable":
      return intl.formatMessage(billingSettingsContentMessages.billingCustomerUnavailable);
    case "unauthorized":
      return intl.formatMessage(billingSettingsContentMessages.billingUnauthorized);
    default:
      break;
  }

  if (error instanceof AutumnClientError && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return intl.formatMessage(billingSettingsContentMessages.billingRequestFailed);
}

function BillingSettingsHeader() {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground antialiased">
          <HugeiconsIcon icon={CreditCardIcon} strokeWidth={1.8} className="size-4 shrink-0" />
          <span>
            <FormattedMessage {...billingSettingsContentMessages.pageLabel} />
          </span>
        </div>
        <TypographyH1 className="mt-2 font-heading text-2xl font-medium text-foreground md:text-2xl">
          <FormattedMessage {...billingSettingsContentMessages.pageTitle} />
        </TypographyH1>
        <TypographyP className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
          <FormattedMessage {...billingSettingsContentMessages.pageDescription} />
        </TypographyP>
      </div>
    </section>
  );
}

function BillingUnavailableCard() {
  return (
    <SurfaceCard>
      <CardHeader className="px-5 py-5">
        <CardTitle className="text-lg font-medium text-foreground">
          <FormattedMessage {...billingSettingsContentMessages.billingUnavailableTitle} />
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          <FormattedMessage {...billingSettingsContentMessages.billingUnavailableDescription} />
        </CardDescription>
      </CardHeader>
    </SurfaceCard>
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
  if (!autumnConfigured) {
    return <BillingUnavailableCard />;
  }

  return (
    <ConfiguredBillingSettingsPanel
      canManageBilling={canManageBilling}
      organizationSlug={organizationSlug}
    />
  );
}

function ConfiguredBillingSettingsPanel({
  canManageBilling,
  organizationSlug,
}: {
  canManageBilling: boolean;
  organizationSlug: string;
}) {
  const intl = useIntl();
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
  const resourceUsageQuery = useQuery({
    queryKey: ["billing-resource-usage", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].billing["resource-usage"].$get(
        {
          param: { organizationSlug },
        },
      );
      if (!response.ok) {
        throw new Error(intl.formatMessage(billingSettingsContentMessages.resourceUsageLoadFailed));
      }

      const body = await response.json();
      return body.resourceUsage;
    },
  });

  const activeSubscription = useMemo(
    () => getActiveSubscription(customer?.subscriptions),
    [customer?.subscriptions],
  );

  const activePlanId = activeSubscription?.planId ?? null;
  const planUsageSummary = useMemo(
    () =>
      resolvePlanUsageSummary({
        subscriptions: customer?.subscriptions,
        balances: customer?.balances,
        plans,
      }),
    [customer?.balances, customer?.subscriptions, plans],
  );
  const isScheduledForCancel = planUsageSummary.isScheduledForCancel;
  const usageRows = billingBalanceFeatureIds
    .filter((featureId) => featureId !== planUsagePrimaryFeatureId)
    .map((featureId) => {
      const balance = customer?.balances?.[featureId];
      const isResourceFeature = isWorkspaceResourceFeatureId(featureId);
      const localUsage = isWorkspaceResourceFeatureId(featureId)
        ? resourceUsageQuery.data?.[featureId]
        : undefined;
      const displayBalance = resolveUsageDisplayBalance({ balance, localUsage });
      return {
        featureId,
        label: getLocalizedUsageFeatureLabel(intl, featureId),
        usageUnavailable:
          isResourceFeature &&
          (resourceUsageQuery.isLoading ||
            resourceUsageQuery.isError ||
            (!balance && resourceUsageQuery.isSuccess)),
        ...displayBalance,
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
      toast.error(formatBillingError(intl, error));
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

  if (isLoading) {
    return (
      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">
            <FormattedMessage {...billingSettingsContentMessages.loadingTitle} />
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            <FormattedMessage {...billingSettingsContentMessages.loadingDescription} />
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
            <FormattedMessage {...billingSettingsContentMessages.loadErrorTitle} />
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {formatBillingError(intl, billingError)}
          </CardDescription>
        </CardHeader>
        <Separator className="bg-skeleton" />
        <CardContent className="px-5 py-4">
          <Button variant="outline" onClick={() => void refetchCustomer()}>
            <FormattedMessage {...billingSettingsContentMessages.tryAgain} />
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
                  <FormattedMessage {...billingSettingsContentMessages.subscriptionTitle} />
                </CardTitle>
                <CardDescription className="mt-1 text-muted-foreground">
                  {activeSubscription ? (
                    isScheduledForCancel ? (
                      <FormattedMessage
                        {...billingSettingsContentMessages.subscriptionCancelingDescription}
                      />
                    ) : (
                      <FormattedMessage
                        {...billingSettingsContentMessages.subscriptionActiveDescription}
                      />
                    )
                  ) : (
                    <FormattedMessage
                      {...billingSettingsContentMessages.subscriptionEmptyDescription}
                    />
                  )}
                </CardDescription>
              </div>
              {activeSubscription ? (
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full border-bud-500/25 bg-bud-500/10 text-bud-100"
                >
                  {isScheduledForCancel ? (
                    <FormattedMessage {...billingSettingsContentMessages.statusCanceling} />
                  ) : (
                    <FormattedMessage {...billingSettingsContentMessages.statusActive} />
                  )}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <Separator className="bg-skeleton" />
          <CardContent className="px-5 py-5">
            {canManageBilling && isScheduledForCancel ? (
              <div className="mt-4">
                <Button
                  variant="outline"
                  disabled={actionPending !== null}
                  onClick={() => void handleUncancelSubscription()}
                >
                  {actionPending === "uncancel" ? (
                    <FormattedMessage {...billingSettingsContentMessages.restoringSubscription} />
                  ) : (
                    <FormattedMessage {...billingSettingsContentMessages.restoreSubscription} />
                  )}
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
                  {actionPending === "cancel" ? (
                    <FormattedMessage {...billingSettingsContentMessages.schedulingCancel} />
                  ) : (
                    <FormattedMessage {...billingSettingsContentMessages.cancelAtPeriodEnd} />
                  )}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
              <HugeiconsIcon icon={Wallet03Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-foreground">
              <FormattedMessage {...billingSettingsContentMessages.billingPortalTitle} />
            </CardTitle>
            <CardDescription className="leading-6 text-muted-foreground">
              <FormattedMessage {...billingSettingsContentMessages.billingPortalDescription} />
            </CardDescription>
          </CardHeader>
          <Separator className="bg-skeleton" />
          <CardContent className="px-5 py-4">
            <Button
              variant="outline"
              className="border-border bg-transparent"
              disabled={!canManageBilling || actionPending !== null}
              onClick={() => void handleOpenPortal()}
            >
              {actionPending === "portal" ? (
                <FormattedMessage {...billingSettingsContentMessages.openingPortal} />
              ) : (
                <FormattedMessage {...billingSettingsContentMessages.manageBilling} />
              )}
            </Button>
            {!canManageBilling ? (
              <TypographyP className="mt-3 text-xs text-muted-foreground">
                <FormattedMessage {...billingSettingsContentMessages.adminOnlyPortal} />
              </TypographyP>
            ) : null}
          </CardContent>
        </SurfaceCard>
      </section>

      <SurfaceCard
        id={planUsageSectionId}
        className="scroll-mt-[calc(var(--app-shell-header-height)+1rem)]"
      >
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">
            <FormattedMessage {...billingSettingsContentMessages.planUsageTitle} />
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            <FormattedMessage {...billingSettingsContentMessages.planUsageDescription} />
          </CardDescription>
        </CardHeader>
        <Separator className="bg-skeleton" />
        <div className="px-5 py-5">
          <PlanUsageSummaryContent summary={planUsageSummary} />
        </div>
        <Separator className="bg-skeleton" />
        <CardContent className="divide-y divide-border px-5 py-0">
          {usageRows.map((row) => (
            <div key={row.featureId} className="flex items-center justify-between gap-4 py-4">
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  {row.label}
                </TypographyP>
                <TypographyP className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...billingSettingsContentMessages.resetsOn}
                    values={{ date: formatResetDate(intl, row.nextResetAt) }}
                  />
                </TypographyP>
              </div>
              <div className="text-right">
                <TypographyP className="text-sm font-medium text-foreground">
                  {row.usageUnavailable ? (
                    <FormattedMessage {...billingSettingsContentMessages.usageUnavailable} />
                  ) : row.unlimited ? (
                    <FormattedMessage {...billingSettingsContentMessages.unlimited} />
                  ) : (
                    <FormattedMessage
                      {...billingSettingsContentMessages.usageUsed}
                      values={{
                        usage: formatUsageValue(intl, row.usage),
                        granted: formatUsageValue(intl, row.granted),
                      }}
                    />
                  )}
                </TypographyP>
                {!row.unlimited && !row.usageUnavailable ? (
                  <TypographyP className="text-xs text-muted-foreground">
                    <FormattedMessage
                      {...billingSettingsContentMessages.usageRemaining}
                      values={{ remaining: formatUsageValue(intl, row.remaining) }}
                    />
                  </TypographyP>
                ) : row.usageUnavailable ? (
                  <TypographyP className="text-xs text-muted-foreground">
                    <FormattedMessage
                      {...billingSettingsContentMessages.planLimit}
                      values={{ granted: formatUsageValue(intl, row.granted) }}
                    />
                  </TypographyP>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </SurfaceCard>

      <SurfaceCard
        id={availablePlansSectionId}
        className="scroll-mt-[calc(var(--app-shell-header-height)+1rem)]"
      >
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">
            <FormattedMessage {...billingSettingsContentMessages.availablePlansTitle} />
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            <FormattedMessage {...billingSettingsContentMessages.availablePlansDescription} />
          </CardDescription>
        </CardHeader>
        <Separator className="bg-skeleton" />
        <CardContent className="divide-y divide-border px-5 py-0">
          {(plans ?? []).map((plan) => {
            const isCurrentPlan = plan.id === activePlanId;
            return (
              <div key={plan.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <TypographyP className="text-sm font-medium text-foreground">
                    {plan.name}
                  </TypographyP>
                  <TypographyP className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                    {plan.description ?? (
                      <FormattedMessage
                        {...billingSettingsContentMessages.planDescriptionFallback}
                      />
                    )}
                  </TypographyP>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {isCurrentPlan ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-border bg-muted text-muted-foreground"
                    >
                      <FormattedMessage {...billingSettingsContentMessages.currentPlan} />
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManageBilling || actionPending !== null}
                      onClick={() => void handleAttachPlan(plan.id)}
                    >
                      {actionPending === `attach-${plan.id}` ? (
                        <FormattedMessage {...billingSettingsContentMessages.startingPlan} />
                      ) : (
                        <FormattedMessage {...billingSettingsContentMessages.selectPlan} />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!plans?.length ? (
            <div className="py-4">
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...billingSettingsContentMessages.noPlansConfigured} />
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
      <PlanUsageHashScroll organizationSlug={organizationSlug} />
      <BillingSettingsHeader />
      <BillingSettingsPanel
        autumnConfigured={autumnConfigured}
        canManageBilling={canManageBilling}
        organizationSlug={organizationSlug}
      />
    </main>
  );
}
