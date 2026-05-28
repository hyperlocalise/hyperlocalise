import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { createCrowdinWebhookSubscriptionAdapter } from "./crowdin/crowdin-webhook-subscription-adapter";
import { createManualProviderWebhookSubscriptionAdapter } from "./manual-provider-webhook-subscription-adapter";
import type { ProviderWebhookSubscriptionAdapter } from "./provider-webhook-subscription-types";

const crowdinAdapter = createCrowdinWebhookSubscriptionAdapter();
const manualAdapter = createManualProviderWebhookSubscriptionAdapter();

/**
 * Returns the subscription adapter for a provider. Providers without automatic
 * setup stay on the manual adapter until their concrete setup ticket lands.
 */
export function getProviderWebhookSubscriptionAdapter(
  providerKind: ExternalTmsProviderKind,
): ProviderWebhookSubscriptionAdapter {
  if (providerKind === "crowdin") {
    return crowdinAdapter;
  }

  return manualAdapter;
}
