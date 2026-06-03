import { env } from "@/lib/env";

import type { ExternalTmsProviderKind } from "../organization-external-tms-provider-credentials";

/** Resolves the public app URL used by provider webhooks, if configured. */
export function resolveHyperlocalisePublicAppUrl() {
  return env.HYPERLOCALISE_PUBLIC_APP_URL ?? null;
}

/** Whether this deployment has enough public URL config to attempt setup. */
export function isAutomaticWebhookSetupEnabled() {
  return resolveHyperlocalisePublicAppUrl() != null;
}

/**
 * Builds the shared inbound TMS webhook endpoint for a provider. The provider
 * slug is path metadata only; provider-specific verification lives in later
 * adapter/mapping work.
 */
export const TMS_WEBHOOK_SUBSCRIPTION_ID_PARAM = "subscription_id";

export function buildTmsWebhookEndpointUrl(
  providerKind: ExternalTmsProviderKind,
  subscriptionId: string,
) {
  const baseUrl = resolveHyperlocalisePublicAppUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${normalizedBase}/api/webhooks/tms/${providerKind}`);
  url.searchParams.set(TMS_WEBHOOK_SUBSCRIPTION_ID_PARAM, subscriptionId);
  return url.toString();
}

export function readTmsWebhookSubscriptionIdFromRequestUrl(requestUrl: string): string | null {
  try {
    const subscriptionId = new URL(requestUrl).searchParams.get(TMS_WEBHOOK_SUBSCRIPTION_ID_PARAM);
    return subscriptionId?.trim() ? subscriptionId.trim() : null;
  } catch {
    return null;
  }
}
