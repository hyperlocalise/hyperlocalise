import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { createManualProviderWebhookSubscriptionAdapter } from "./manual-provider-webhook-subscription-adapter";
import type { ProviderWebhookSubscriptionAdapter } from "./provider-webhook-subscription-types";

const manualAdapter = createManualProviderWebhookSubscriptionAdapter();

/**
 * Returns the subscription adapter for a provider. HL-402 keeps all providers on
 * the manual adapter; HL-404 and later provider tickets should register concrete
 * adapters here.
 */
export function getProviderWebhookSubscriptionAdapter(
  _providerKind: ExternalTmsProviderKind,
): ProviderWebhookSubscriptionAdapter {
  return manualAdapter;
}
