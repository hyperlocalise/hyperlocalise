import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookSubscriptionAdapter,
} from "./provider-webhook-subscription-types";

/**
 * Placeholder adapter used until provider-specific webhook APIs land in the
 * follow-up tickets. Returning `supportsAutomaticSetup: false` drives the shared
 * manager into the manual fallback path without attempting provider API calls.
 */
export function createManualProviderWebhookSubscriptionAdapter(): ProviderWebhookSubscriptionAdapter {
  return {
    supportsAutomaticSetup: false,
    async listRemoteSubscriptions() {
      return [];
    },
    async createRemoteSubscription() {
      throw new ProviderWebhookSubscriptionAdapterError(
        "not_supported",
        "Automatic webhook setup is not available for this provider yet",
      );
    },
    async updateRemoteSubscription() {
      throw new ProviderWebhookSubscriptionAdapterError(
        "not_supported",
        "Automatic webhook setup is not available for this provider yet",
      );
    },
    async disableRemoteSubscription() {
      throw new ProviderWebhookSubscriptionAdapterError(
        "not_supported",
        "Automatic webhook setup is not available for this provider yet",
      );
    },
    async deleteRemoteSubscription() {
      throw new ProviderWebhookSubscriptionAdapterError(
        "not_supported",
        "Automatic webhook setup is not available for this provider yet",
      );
    },
  };
}
