import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookRemoteSubscription,
  type ProviderWebhookSubscriptionAdapter,
  type ProviderWebhookSubscriptionAdapterContext,
} from "../provider-webhook-subscription-types";

function requireExternalProjectId(context: ProviderWebhookSubscriptionAdapterContext) {
  if (!context.externalProjectId) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Crowdin webhooks require an external project id",
    );
  }

  const projectId = Number(context.externalProjectId);
  if (!Number.isFinite(projectId)) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Crowdin external project id must be numeric",
    );
  }

  return projectId;
}

function mapCrowdinError(error: unknown): never {
  if (error instanceof CrowdinApiError) {
    if (error.status === 401 || error.status === 403) {
      throw new ProviderWebhookSubscriptionAdapterError(
        "permission_denied",
        "Crowdin rejected webhook management with the stored credential",
        { httpStatus: error.status, cause: error },
      );
    }

    throw new ProviderWebhookSubscriptionAdapterError(
      "provider_error",
      `Crowdin webhook API returned HTTP ${error.status}`,
      { httpStatus: error.status, cause: error },
    );
  }

  throw new ProviderWebhookSubscriptionAdapterError(
    "provider_error",
    error instanceof Error ? error.message : "Crowdin webhook request failed",
    { cause: error },
  );
}

function createClient(context: ProviderWebhookSubscriptionAdapterContext) {
  return new CrowdinApiClient({
    token: context.secretMaterial,
    baseUrl: context.baseUrl ?? undefined,
    fetchFn: context.fetchFn,
  });
}

function mapWebhook(webhook: {
  id: number;
  url: string;
  events: string[];
  isActive: boolean;
}): ProviderWebhookRemoteSubscription {
  return {
    providerWebhookId: String(webhook.id),
    endpointUrl: webhook.url,
    subscribedEvents: webhook.events,
    isActive: webhook.isActive,
  };
}

export const crowdinWebhookSubscriptionAdapter: ProviderWebhookSubscriptionAdapter = {
  supportsAutomaticSetup: true,

  async listRemoteSubscriptions(context) {
    try {
      const projectId = requireExternalProjectId(context);
      const client = createClient(context);
      const webhooks = await client.listProjectWebhooks(projectId);
      return webhooks.map(mapWebhook);
    } catch (error) {
      if (error instanceof ProviderWebhookSubscriptionAdapterError) {
        throw error;
      }
      return mapCrowdinError(error);
    }
  },

  async createRemoteSubscription(context) {
    try {
      const projectId = requireExternalProjectId(context);
      const client = createClient(context);
      const webhook = await client.createProjectWebhook(projectId, {
        name: `Hyperlocalise ${context.projectId ?? projectId}`,
        url: context.endpointUrl,
        events: context.subscribedEvents,
        secret: context.webhookSecret,
        headers: {
          "X-Provider-Webhook-Id": `pending`,
        },
      });

      const mapped = mapWebhook(webhook);
      await client.updateProjectWebhook(projectId, webhook.id, {
        headers: {
          "X-Provider-Webhook-Id": mapped.providerWebhookId,
        },
      });

      return mapped;
    } catch (error) {
      if (error instanceof ProviderWebhookSubscriptionAdapterError) {
        throw error;
      }
      return mapCrowdinError(error);
    }
  },

  async updateRemoteSubscription(context) {
    try {
      const projectId = requireExternalProjectId(context);
      const client = createClient(context);
      const webhookId = Number(context.providerWebhookId);
      const webhook = await client.updateProjectWebhook(projectId, webhookId, {
        url: context.endpointUrl,
        events: context.subscribedEvents,
        isActive: true,
        secret: context.webhookSecret,
        headers: {
          "X-Provider-Webhook-Id": context.providerWebhookId,
        },
      });
      return mapWebhook(webhook);
    } catch (error) {
      if (error instanceof ProviderWebhookSubscriptionAdapterError) {
        throw error;
      }
      return mapCrowdinError(error);
    }
  },

  async disableRemoteSubscription(context) {
    try {
      const projectId = requireExternalProjectId(context);
      const client = createClient(context);
      await client.updateProjectWebhook(projectId, Number(context.providerWebhookId), {
        isActive: false,
      });
    } catch (error) {
      if (error instanceof ProviderWebhookSubscriptionAdapterError) {
        throw error;
      }
      return mapCrowdinError(error);
    }
  },

  async deleteRemoteSubscription(context) {
    try {
      const projectId = requireExternalProjectId(context);
      const client = createClient(context);
      await client.deleteProjectWebhook(projectId, Number(context.providerWebhookId));
    } catch (error) {
      if (error instanceof ProviderWebhookSubscriptionAdapterError) {
        throw error;
      }
      return mapCrowdinError(error);
    }
  },
};
