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
export function buildTmsWebhookEndpointUrl(providerKind: ExternalTmsProviderKind) {
  const baseUrl = resolveHyperlocalisePublicAppUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/api/webhooks/tms/${providerKind}`;
}
