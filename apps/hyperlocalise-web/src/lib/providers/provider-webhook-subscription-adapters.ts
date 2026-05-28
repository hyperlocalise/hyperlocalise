import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { crowdinWebhookSubscriptionAdapter } from "./crowdin/crowdin-webhook-subscription-adapter";
import { createManualProviderWebhookSubscriptionAdapter } from "./manual-provider-webhook-subscription-adapter";
import type { ProviderWebhookSubscriptionAdapter } from "./provider-webhook-subscription-types";

const manualAdapter = createManualProviderWebhookSubscriptionAdapter();

export function getProviderWebhookSubscriptionAdapter(
  providerKind: ExternalTmsProviderKind,
): ProviderWebhookSubscriptionAdapter {
  switch (providerKind) {
    case "crowdin":
      return crowdinWebhookSubscriptionAdapter;
    case "phrase":
    case "lokalise":
    case "smartling":
      return manualAdapter;
  }
}
