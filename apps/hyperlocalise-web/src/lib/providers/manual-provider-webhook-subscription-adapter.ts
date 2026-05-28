import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookSubscriptionAdapter,
} from "./provider-webhook-subscription-types";

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
