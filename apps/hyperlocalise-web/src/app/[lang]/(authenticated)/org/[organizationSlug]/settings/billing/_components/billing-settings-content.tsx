"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutumnClientError, useCustomer, useListPlans } from "autumn-js/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
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
import { SettingsPageBody, SettingsPageHeader } from "../../_components/settings-page-chrome";

const workspaceResourceFeatureIds = [
  autumnFeatureIds.seats,
  autumnFeatureIds.projects,
  autumnFeatureIds.automations,
  autumnFeatureIds.integrations,
] as const;

type WorkspaceResourceFeatureId = (typeof workspaceResourceFeatureIds)[number];

const workspaceResourceUsageFeatureIds = new Set<string>(workspaceResourceFeatureIds);

function BillingNotice({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <Rows spacing="1u">
      <TypographyP className="text-sm font-medium text-foreground">{title}</TypographyP>
      <TypographyP className="text-pretty text-sm text-muted-foreground">{description}</TypographyP>
    </Rows>
  );
}

function BillingUnavailableCard() {
  return (
    <BillingNotice
      title={<FormattedMessage {...billingSettingsContentMessages.billingUnavailableTitle} />}
      description={
        <FormattedMessage {...billingSettingsContentMessages.billingUnavailableDescription} />
      }
    />
  );
}

function BillingSettingsHeader() {
  const intl = useIntl();

  return (
    <SettingsPageHeader
      eyebrow={intl.formatMessage(billingSettingsContentMessages.pageLabel)}
      title={intl.formatMessage(billingSettingsContentMessages.pageTitle)}
      description={intl.formatMessage(billingSettingsContentMessages.pageDescription)}
    />
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

function formatCurrentPlanCopy({
  intl,
  hasActiveSubscription,
  isScheduledForCancel,
  renewalLabel,
}: {
  intl: IntlShape;
  hasActiveSubscription: boolean;
  isScheduledForCancel: boolean;
  renewalLabel: string | null;
}) {
  if (!hasActiveSubscription) {
    return intl.formatMessage(billingSettingsContentMessages.subscriptionEmptyDescription);
  }

  const renewal = renewalLabel
    ? intl.formatMessage(
        isScheduledForCancel
          ? billingSettingsContentMessages.accessUntilDate
          : billingSettingsContentMessages.renewsDate,
        { date: renewalLabel },
      )
    : null;
  const hint = intl.formatMessage(
    isScheduledForCancel
      ? billingSettingsContentMessages.subscriptionCancelingDescription
      : billingSettingsContentMessages.subscriptionActiveDescription,
  );

  return renewal ? `${renewal}. ${hint}` : hint;
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
      <BillingNotice
        title={<FormattedMessage {...billingSettingsContentMessages.loadingTitle} />}
        description={<FormattedMessage {...billingSettingsContentMessages.loadingDescription} />}
      />
    );
  }

  if (billingError) {
    return (
      <Rows spacing="3u">
        <BillingNotice
          title={<FormattedMessage {...billingSettingsContentMessages.loadErrorTitle} />}
          description={formatBillingError(intl, billingError)}
        />
        <Row spacing="0">
          <Button variant="outline" size="sm" onClick={() => void refetchCustomer()}>
            <FormattedMessage {...billingSettingsContentMessages.tryAgain} />
          </Button>
        </Row>
      </Rows>
    );
  }

  const planName =
    planUsageSummary.activePlanName ??
    intl.formatMessage(billingSettingsContentMessages.noActivePlanTitle);
  const planCopy = formatCurrentPlanCopy({
    intl,
    hasActiveSubscription: Boolean(activeSubscription),
    isScheduledForCancel,
    renewalLabel: planUsageSummary.renewalLabel,
  });

  return (
    <Rows spacing="6u">
      <div className="border-b border-border pb-8">
        <Rows spacing="3u">
          <Rows spacing="1u">
            <Row spacing="1.5u" alignY="center">
              <TypographyP className="text-sm leading-tight font-medium text-foreground">
                {planName}
              </TypographyP>
              {activeSubscription ? (
                <Badge
                  variant="secondary"
                  className={
                    isScheduledForCancel
                      ? undefined
                      : "border-transparent bg-blue-100 text-blue-900"
                  }
                >
                  {isScheduledForCancel ? (
                    <FormattedMessage {...billingSettingsContentMessages.statusCanceling} />
                  ) : (
                    <FormattedMessage {...billingSettingsContentMessages.statusActive} />
                  )}
                </Badge>
              ) : null}
            </Row>
            <TypographyP className="text-sm leading-snug text-muted-foreground">
              {planCopy}
            </TypographyP>
          </Rows>
          <Row spacing="2u" alignY="center">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManageBilling || actionPending !== null}
              onClick={() => void handleOpenPortal()}
            >
              {actionPending === "portal" ? (
                <FormattedMessage {...billingSettingsContentMessages.openingPortal} />
              ) : (
                <FormattedMessage {...billingSettingsContentMessages.manageBilling} />
              )}
            </Button>
            {canManageBilling && isScheduledForCancel ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={actionPending !== null}
                onClick={() => void handleUncancelSubscription()}
              >
                {actionPending === "uncancel" ? (
                  <FormattedMessage {...billingSettingsContentMessages.restoringSubscription} />
                ) : (
                  <FormattedMessage {...billingSettingsContentMessages.restoreSubscription} />
                )}
              </Button>
            ) : null}
            {canManageBilling && activeSubscription && !isScheduledForCancel ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={actionPending !== null}
                onClick={() => void handleCancelSubscription()}
              >
                {actionPending === "cancel" ? (
                  <FormattedMessage {...billingSettingsContentMessages.schedulingCancel} />
                ) : (
                  <FormattedMessage {...billingSettingsContentMessages.cancelAtPeriodEnd} />
                )}
              </Button>
            ) : null}
          </Row>
          {!canManageBilling ? (
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage {...billingSettingsContentMessages.adminOnlyPortal} />
            </TypographyP>
          ) : null}
        </Rows>
      </div>

      <div
        id={planUsageSectionId}
        className="scroll-mt-[calc(var(--app-shell-header-height)+1rem)]"
      >
        <Rows spacing="1u">
          <TypographyP className="pb-2 text-sm leading-tight font-medium text-foreground">
            <FormattedMessage {...billingSettingsContentMessages.planUsageTitle} />
          </TypographyP>
          {usageRows.map((row) => (
            <div key={row.featureId} className="min-h-12 border-t border-border py-3">
              <Row spacing="2u" align="spaceBetween" alignY="center">
                <Rows spacing="0.5u">
                  <TypographyP className="text-sm leading-tight font-medium text-foreground">
                    {row.label}
                  </TypographyP>
                  <TypographyP className="text-xs leading-none text-subtle-foreground">
                    <FormattedMessage
                      {...billingSettingsContentMessages.resetsOn}
                      values={{ date: formatResetDate(intl, row.nextResetAt) }}
                    />
                  </TypographyP>
                </Rows>
                <Rows spacing="0.5u" align="end">
                  <TypographyP className="text-sm leading-tight font-medium text-foreground tabular-nums">
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
                    <TypographyP className="text-xs leading-none text-subtle-foreground">
                      <FormattedMessage
                        {...billingSettingsContentMessages.usageRemaining}
                        values={{ remaining: formatUsageValue(intl, row.remaining) }}
                      />
                    </TypographyP>
                  ) : row.usageUnavailable ? (
                    <TypographyP className="text-xs leading-none text-subtle-foreground">
                      <FormattedMessage
                        {...billingSettingsContentMessages.planLimit}
                        values={{ granted: formatUsageValue(intl, row.granted) }}
                      />
                    </TypographyP>
                  ) : null}
                </Rows>
              </Row>
            </div>
          ))}
        </Rows>
      </div>

      <div
        id={availablePlansSectionId}
        className="scroll-mt-[calc(var(--app-shell-header-height)+1rem)]"
      >
        <Rows spacing="1u">
          <TypographyP className="pb-2 text-sm leading-tight font-medium text-foreground">
            <FormattedMessage {...billingSettingsContentMessages.availablePlansTitle} />
          </TypographyP>
          {(plans ?? []).map((plan) => {
            const isCurrentPlan = plan.id === activePlanId;
            return (
              <div key={plan.id} className="border-t border-border py-3.5">
                <Row spacing="2u" align="spaceBetween" alignY="center">
                  <Rows spacing="0.5u">
                    <TypographyP className="text-sm leading-tight font-medium text-foreground">
                      {plan.name}
                    </TypographyP>
                    <TypographyP className="text-sm leading-tight text-muted-foreground">
                      {plan.description ?? (
                        <FormattedMessage
                          {...billingSettingsContentMessages.planDescriptionFallback}
                        />
                      )}
                    </TypographyP>
                  </Rows>
                  {isCurrentPlan ? (
                    <Badge variant="secondary">
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
                </Row>
              </div>
            );
          })}
          {!plans?.length ? (
            <TypographyP className="border-t border-border py-3.5 text-sm text-muted-foreground">
              <FormattedMessage {...billingSettingsContentMessages.noPlansConfigured} />
            </TypographyP>
          ) : null}
        </Rows>
      </div>
    </Rows>
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
    <SettingsPageBody width="wide">
      <div className="w-full max-w-[45rem]">
        <PlanUsageHashScroll organizationSlug={organizationSlug} />
        <Rows spacing="6u">
          <BillingSettingsHeader />
          <BillingSettingsPanel
            autumnConfigured={autumnConfigured}
            canManageBilling={canManageBilling}
            organizationSlug={organizationSlug}
          />
        </Rows>
      </div>
    </SettingsPageBody>
  );
}
