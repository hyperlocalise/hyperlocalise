import { env } from "@/lib/env";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function resolveHyperlocalisePublicAppUrl() {
  return env.HYPERLOCALISE_PUBLIC_APP_URL ?? null;
}

export function isAutomaticWebhookSetupEnabled() {
  return resolveHyperlocalisePublicAppUrl() != null;
}

export function buildTmsWebhookEndpointUrl(providerKind: ExternalTmsProviderKind) {
  const baseUrl = resolveHyperlocalisePublicAppUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/api/webhooks/tms/${providerKind}`;
}
